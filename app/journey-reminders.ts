import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { getDb } from "../db";
import { adventurePlans, notifications, planMembers, safetyProfiles } from "../db/schema";
import { SYSTEM_CHAT_AUTHOR } from "./check-in-overdue";

type Database = Awaited<ReturnType<typeof getDb>>;

export const JOURNEY_REMINDER_TYPE = "journey_reminder" as const;

/** Ideal first fire ~24h out; hourly cron keeps each journey in-window for ~2h. */
export const REMINDER_WINDOW_MIN_MS = 23 * 60 * 60 * 1000;
/** Catch-up ceiling: still remind once if the cron was late, until the journey starts. */
export const REMINDER_WINDOW_MAX_MS = 25 * 60 * 60 * 1000;

export function journeyReminderId(planId: string, recipientEmail: string) {
  return `journey-reminder:${planId}:${recipientEmail.trim().toLowerCase()}`;
}

export function isJourneyReminderEligible(input: {
  status: string;
  startedAt: Date | null;
  startsAt: Date;
  now: Date;
}) {
  if (input.status === "cancelled" || input.status === "completed" || input.status === "started") {
    return false;
  }
  if (input.startedAt) return false;
  const msUntil = input.startsAt.getTime() - input.now.getTime();
  // Primary window [23h, 25h]. Catch-up: (0, 23h) so a missed cron still lands one reminder.
  return msUntil > 0 && msUntil <= REMINDER_WINDOW_MAX_MS;
}

export function formatReminderTime(startsAt: Date) {
  return startsAt
    .toLocaleString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();
}

export function journeyReminderBody(title: string, startsAt: Date, needsSafetyContact: boolean, now = new Date()) {
  const cleanTitle = title.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "your journey";
  const msUntil = startsAt.getTime() - now.getTime();
  const prefix = msUntil <= 12 * 60 * 60 * 1000 ? "Today" : "Tomorrow";
  let body = `${prefix}: ${cleanTitle}, ${formatReminderTime(startsAt)}`;
  if (needsSafetyContact) {
    body += ". Add a safety contact before you go.";
  }
  return body.slice(0, 240);
}

function hasSafetyContact(row: { contactName: string; contactMethod: string } | undefined) {
  if (!row) return false;
  return Boolean(row.contactName.trim() || row.contactMethod.trim());
}

/**
 * One Activity inbox row per host/accepted member for journeys starting within
 * the next 25 hours. Deterministic ids keep hourly (or read-time) repeats idempotent.
 */
export async function sendDueJourneyReminders(db: Database, now = new Date()) {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MAX_MS);
  const plans = await db
    .select()
    .from(adventurePlans)
    .where(
      and(
        inArray(adventurePlans.status, ["open", "scheduled"]),
        gt(adventurePlans.startsAt, now),
        lte(adventurePlans.startsAt, windowEnd),
      ),
    );

  const due = plans.filter((plan) =>
    isJourneyReminderEligible({
      status: plan.status,
      startedAt: plan.startedAt,
      startsAt: plan.startsAt,
      now,
    }),
  );
  if (!due.length) return { plans: 0, sent: 0 };

  const planIds = due.map((plan) => plan.id);
  const members = await db
    .select()
    .from(planMembers)
    .where(and(inArray(planMembers.planId, planIds), eq(planMembers.status, "accepted")));

  /** planId → Map of lowercased email → canonical email for the notification row */
  const recipientsByPlan = new Map<string, Map<string, string>>();
  for (const plan of due) {
    const map = new Map<string, string>();
    map.set(plan.hostEmail.trim().toLowerCase(), plan.hostEmail);
    recipientsByPlan.set(plan.id, map);
  }
  for (const member of members) {
    const map = recipientsByPlan.get(member.planId);
    if (!map) continue;
    const key = member.userEmail.trim().toLowerCase();
    if (!map.has(key)) map.set(key, member.userEmail);
  }

  const allEmails = Array.from(
    new Set(Array.from(recipientsByPlan.values()).flatMap((map) => Array.from(map.values()))),
  );
  const safetyRows = allEmails.length
    ? await db.select().from(safetyProfiles).where(inArray(safetyProfiles.userEmail, allEmails))
    : [];
  const safetyByEmail = new Map(safetyRows.map((row) => [row.userEmail.trim().toLowerCase(), row]));

  let sent = 0;
  for (const plan of due) {
    const recipients = recipientsByPlan.get(plan.id);
    if (!recipients?.size) continue;
    for (const email of recipients.values()) {
      const needsSafety = !hasSafetyContact(safetyByEmail.get(email.trim().toLowerCase()));
      const id = journeyReminderId(plan.id, email);
      const inserted = await db
        .insert(notifications)
        .values({
          id,
          recipientEmail: email,
          actorEmail: SYSTEM_CHAT_AUTHOR,
          type: JOURNEY_REMINDER_TYPE,
          postId: null,
          planId: plan.id,
          body: journeyReminderBody(plan.title, plan.startsAt, needsSafety, now),
          readAt: null,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      if (inserted.length) sent += 1;
    }
  }

  return { plans: due.length, sent };
}
