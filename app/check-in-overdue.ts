import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import {
  adventurePlans,
  chatMessages,
  conversations,
  planMembers,
  profiles,
  safetyProfiles,
} from "../db/schema";
import { loadTwilioConfig, maybeSendOverdueSms } from "./check-in-sms";

type Database = Awaited<ReturnType<typeof getDb>>;

export const SYSTEM_CHAT_AUTHOR = "system@waymark";
export const DEFAULT_CHECK_IN_MINUTES = 120;
const MIN_CHECK_IN_MINUTES = 30;
const MAX_CHECK_IN_MINUTES = 1440;

export type CheckInOverdueState = {
  overdue: boolean;
  dueAt: string;
  minutes: number;
};

export function clampCheckInMinutes(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CHECK_IN_MINUTES;
  return Math.max(MIN_CHECK_IN_MINUTES, Math.min(MAX_CHECK_IN_MINUTES, Math.round(parsed)));
}

export function checkInAnchor(member: { checkedInAt: Date | null }, plan: { startedAt: Date | null; startsAt: Date }) {
  return member.checkedInAt ?? plan.startedAt ?? plan.startsAt;
}

export function isParticipantOverdue(input: {
  status: string;
  startedAt: Date | null;
  startsAt: Date;
  memberStatus: string;
  safeAt: Date | null;
  checkedInAt: Date | null;
  checkInMinutes: number;
  now: Date;
}) {
  if (input.status === "cancelled" || input.status === "completed") return false;
  const started =
    input.status === "started" ||
    Boolean(input.startedAt) ||
    input.startsAt.getTime() <= input.now.getTime();
  if (!started || input.memberStatus !== "accepted" || input.safeAt) return false;
  const anchor = checkInAnchor(input, input);
  const minutes = clampCheckInMinutes(input.checkInMinutes);
  return input.now.getTime() >= anchor.getTime() + minutes * 60 * 1000;
}

export function overdueNoteBody(displayName: string, minutes: number) {
  const name = displayName.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "A participant";
  return `Check-in overdue: ${name} missed their ${minutes}-minute check-in without marking I’m safe.`;
}

export function overdueMessageId(planId: string, memberId: string, anchorMs: number) {
  return `overdue:${planId}:${memberId}:${anchorMs}`;
}

export function isSystemChatAuthor(email: string) {
  return email === SYSTEM_CHAT_AUTHOR;
}

/**
 * Read-time overdue check. Posts at most one journey-chat note per participant
 * per check-in window (journey start, or the latest Check-in which clears I’m safe).
 * I’m safe (safeAt) clears the overdue state without deleting the note.
 * The same read sends at most one safety-contact SMS for that window when Twilio is configured.
 */
export async function syncOverdueCheckIns(
  db: Database,
  planIds: string[],
  now = new Date(),
) {
  const states = new Map<string, CheckInOverdueState>();
  const uniqueIds = Array.from(new Set(planIds.filter(Boolean)));
  if (!uniqueIds.length) return states;

  const plans = await db
    .select()
    .from(adventurePlans)
    .where(inArray(adventurePlans.id, uniqueIds));
  const activePlans = plans.filter(
    (plan) => plan.status !== "cancelled" && plan.status !== "completed",
  );
  if (!activePlans.length) return states;

  const activeIds = activePlans.map((plan) => plan.id);
  const members = await db
    .select()
    .from(planMembers)
    .where(inArray(planMembers.planId, activeIds));
  const accepted = members.filter((member) => member.status === "accepted");
  const emails = Array.from(new Set(accepted.map((member) => member.userEmail)));
  const [safetyRows, profileRows, chats] = await Promise.all([
    emails.length
      ? db.select().from(safetyProfiles).where(inArray(safetyProfiles.userEmail, emails))
      : Promise.resolve([]),
    emails.length
      ? db.select().from(profiles).where(inArray(profiles.email, emails))
      : Promise.resolve([]),
    db.select().from(conversations).where(inArray(conversations.adventurePlanId, activeIds)),
  ]);
  const minutesByEmail = new Map(
    safetyRows.map((row) => [row.userEmail, row.defaultCheckInMinutes]),
  );
  const contactByEmail = new Map(
    safetyRows.map((row) => [row.userEmail, row.contactMethod]),
  );
  const nameByEmail = new Map(profileRows.map((row) => [row.email, row.displayName]));
  const smsConfig = await loadTwilioConfig();
  const chatByPlan = new Map(
    chats
      .filter((chat) => chat.adventurePlanId)
      .map((chat) => [chat.adventurePlanId as string, chat]),
  );

  for (const plan of activePlans) {
    for (const member of accepted) {
      if (member.planId !== plan.id) continue;
      const minutes = clampCheckInMinutes(minutesByEmail.get(member.userEmail));
      const anchor = checkInAnchor(member, plan);
      const dueAt = new Date(anchor.getTime() + minutes * 60 * 1000);
      const overdue = isParticipantOverdue({
        status: plan.status,
        startedAt: plan.startedAt,
        startsAt: plan.startsAt,
        memberStatus: member.status,
        safeAt: member.safeAt,
        checkedInAt: member.checkedInAt,
        checkInMinutes: minutes,
        now,
      });
      states.set(member.id, { overdue, dueAt: dueAt.toISOString(), minutes });
      if (!overdue) continue;

      await maybeSendOverdueSms(db, {
        config: smsConfig,
        planId: plan.id,
        memberId: member.id,
        anchor,
        displayName: nameByEmail.get(member.userEmail) || "A participant",
        contactMethod: contactByEmail.get(member.userEmail),
        now,
      });

      const chat = chatByPlan.get(plan.id);
      if (!chat || (chat.expiresAt && chat.expiresAt.getTime() <= now.getTime())) continue;

      const id = overdueMessageId(plan.id, member.id, anchor.getTime());
      await db
        .insert(chatMessages)
        .values({
          id,
          conversationId: chat.id,
          authorEmail: SYSTEM_CHAT_AUTHOR,
          body: overdueNoteBody(nameByEmail.get(member.userEmail) || "A participant", minutes),
          createdAt: now,
        })
        .onConflictDoNothing();

      const [saved] = await db
        .select({ createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);
      if (saved && Math.abs(saved.createdAt.getTime() - now.getTime()) < 5000) {
        await db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, chat.id));
      }
    }
  }

  return states;
}
