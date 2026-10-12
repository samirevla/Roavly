import { and, eq, inArray, lte, or } from "drizzle-orm";
import type { getDb } from "../db";
import { adventurePlans, notifications } from "../db/schema";

type Database = Awaited<ReturnType<typeof getDb>>;

/** Activity inbox types. Rows live in the existing notifications table (no migration). */
export const CHECKIN_OVERDUE_TYPE = "checkin_overdue" as const;
export const CHECKIN_SAFE_TYPE = "checkin_safe" as const;
export const CHECKIN_HEADS_UP_TYPE = "checkin_heads_up" as const;

/** The traveller gets one heads-up this long before their own check-in window closes. */
export const HEADS_UP_LEAD_MS = 15 * 60 * 1000;

/** Do not raise an Activity alert for a window that went overdue more than a day ago. */
export const OVERDUE_ACTIVITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Same author as journey-chat system notes; the inbox shows it as "Waymark". */
const SYSTEM_ACTOR = "system@waymark";

function cleanText(value: string, fallback: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || fallback;
}

function emailKey(email: string) {
  return email.trim().toLowerCase();
}

function windowPrefix(planId: string, memberId: string, anchorMs: number) {
  return `${planId}:${memberId}:${anchorMs}:`;
}

export function overdueActivityId(planId: string, memberId: string, anchorMs: number, recipientEmail: string) {
  return `overdue-checkin:${windowPrefix(planId, memberId, anchorMs)}${emailKey(recipientEmail)}`;
}

export function overdueSafeActivityId(planId: string, memberId: string, anchorMs: number, recipientEmail: string) {
  return `overdue-safe:${windowPrefix(planId, memberId, anchorMs)}${emailKey(recipientEmail)}`;
}

/** Host + accepted members, deduped case-insensitively, never the overdue person. */
export function overdueRecipients(
  hostEmail: string,
  acceptedEmails: string[],
  overdueEmail: string,
) {
  const skip = emailKey(overdueEmail);
  const byKey = new Map<string, string>();
  for (const email of [hostEmail, ...acceptedEmails]) {
    const key = emailKey(email || "");
    if (!key || key === skip || byKey.has(key)) continue;
    byKey.set(key, email);
  }
  return Array.from(byKey.values());
}

export function overdueActivityBody(displayName: string, minutes: number, title: string) {
  const name = cleanText(displayName, "A participant");
  const plan = cleanText(title, "your journey");
  return `Check-in overdue: ${name} missed their ${minutes}-minute check-in on “${plan}” and hasn’t marked I’m safe.`.slice(0, 240);
}

export type OverdueResolution = "safe" | "checkin" | "finished" | "finished_by_host";

export function overdueSafeBody(displayName: string, title: string, reason: OverdueResolution) {
  const name = cleanText(displayName, "A participant");
  const plan = cleanText(title, "your journey");
  const body =
    reason === "finished_by_host"
      ? `Overdue check-in closed: “${plan}” was marked finished before ${name} marked I’m safe.`
      : reason === "finished"
        ? `${name} is safe: they finished “${plan}”.`
        : reason === "checkin"
          ? `${name} is safe: they checked in on “${plan}”.`
          : `${name} is safe: they marked I’m safe on “${plan}”.`;
  return body.slice(0, 240);
}

/**
 * One Activity row per recipient for this missed check-in window. Deterministic ids keep
 * read-time syncs and the 5-minute cron idempotent. Never throws.
 */
export async function recordOverdueActivity(
  db: Database,
  input: {
    plan: { id: string; title: string; hostEmail: string; status: string };
    acceptedEmails: string[];
    member: { id: string; userEmail: string };
    anchor: Date;
    dueAt: Date;
    minutes: number;
    displayName: string;
    now: Date;
  },
) {
  try {
    if (input.plan.status === "cancelled" || input.plan.status === "completed") return 0;
    if (input.now.getTime() - input.dueAt.getTime() > OVERDUE_ACTIVITY_MAX_AGE_MS) return 0;
    const recipients = overdueRecipients(input.plan.hostEmail, input.acceptedEmails, input.member.userEmail);
    if (!recipients.length) return 0;
    const anchorMs = input.anchor.getTime();
    const body = overdueActivityBody(input.displayName, input.minutes, input.plan.title);
    let sent = 0;
    // One row per statement keeps well under D1's bound-parameter limit for big groups.
    for (const recipientEmail of recipients) {
      const inserted = await db
        .insert(notifications)
        .values({
          id: overdueActivityId(input.plan.id, input.member.id, anchorMs, recipientEmail),
          recipientEmail,
          actorEmail: SYSTEM_ACTOR,
          type: CHECKIN_OVERDUE_TYPE,
          postId: null,
          planId: input.plan.id,
          body,
          readAt: null,
          createdAt: input.now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      sent += inserted.length;
    }
    return sent;
  } catch (error) {
    console.error("overdue check-in activity failed", error);
    return 0;
  }
}

/**
 * Follow-up for a window that already raised an overdue alert: exactly the people who got
 * the alert get one "safe" row each. No alert for that window means nothing is sent.
 */
export async function resolveOverdueActivity(
  db: Database,
  input: {
    planId: string;
    title: string;
    memberId: string;
    anchor: Date;
    displayName: string;
    reason: OverdueResolution;
    now: Date;
  },
) {
  try {
    const anchorMs = input.anchor.getTime();
    const alertPrefix = `overdue-checkin:${windowPrefix(input.planId, input.memberId, anchorMs)}`;
    const alerts = (
      await db
        .select({ id: notifications.id, recipientEmail: notifications.recipientEmail })
        .from(notifications)
        .where(and(eq(notifications.planId, input.planId), eq(notifications.type, CHECKIN_OVERDUE_TYPE)))
    ).filter((row) => row.id.startsWith(alertPrefix));
    if (!alerts.length) return 0;
    const body = overdueSafeBody(input.displayName, input.title, input.reason);
    let sent = 0;
    for (const alert of alerts) {
      const inserted = await db
        .insert(notifications)
        .values({
          id: overdueSafeActivityId(input.planId, input.memberId, anchorMs, alert.recipientEmail),
          recipientEmail: alert.recipientEmail,
          actorEmail: SYSTEM_ACTOR,
          type: CHECKIN_SAFE_TYPE,
          postId: null,
          planId: input.planId,
          body,
          readAt: null,
          createdAt: input.now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      sent += inserted.length;
    }
    return sent;
  } catch (error) {
    console.error("overdue safe activity failed", error);
    return 0;
  }
}

export function headsUpActivityId(planId: string, memberId: string, anchorMs: number) {
  return `checkin-heads-up:${planId}:${memberId}:${anchorMs}`;
}

export function headsUpBody(minutesLeft: number, title: string) {
  const plan = cleanText(title, "your journey");
  return `Check-in due in ${minutesLeft} min on “${plan}”. Tap to mark I’m safe.`.slice(0, 240);
}

/** True inside the last 15 minutes of an open window (not yet safe, not yet overdue). */
export function isHeadsUpDue(input: { dueAt: Date; now: Date; safe: boolean; overdue: boolean }) {
  if (input.safe || input.overdue) return false;
  const left = input.dueAt.getTime() - input.now.getTime();
  return left > 0 && left <= HEADS_UP_LEAD_MS;
}

/**
 * One Activity row for the traveller themself, ~15 min before their own window closes.
 * The id is per window (anchor), so later ticks never duplicate; a Check-in starts a new
 * window and I'm safe stops it. Never throws.
 */
export async function recordHeadsUpActivity(
  db: Database,
  input: {
    plan: { id: string; title: string };
    member: { id: string; userEmail: string };
    anchor: Date;
    dueAt: Date;
    now: Date;
  },
) {
  try {
    const minutesLeft = Math.max(1, Math.ceil((input.dueAt.getTime() - input.now.getTime()) / 60000));
    const inserted = await db
      .insert(notifications)
      .values({
        id: headsUpActivityId(input.plan.id, input.member.id, input.anchor.getTime()),
        recipientEmail: input.member.userEmail,
        actorEmail: SYSTEM_ACTOR,
        type: CHECKIN_HEADS_UP_TYPE,
        postId: null,
        planId: input.plan.id,
        body: headsUpBody(minutesLeft, input.plan.title),
        readAt: null,
        createdAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    return inserted.length;
  } catch (error) {
    console.error("check-in heads-up activity failed", error);
    return 0;
  }
}

/** Ids of journeys that have (or should have) started and are not cancelled/completed. */
export async function activeStartedPlanIds(db: Database, now = new Date()) {
  const rows = await db
    .select({ id: adventurePlans.id })
    .from(adventurePlans)
    .where(
      and(
        inArray(adventurePlans.status, ["open", "scheduled", "started"]),
        or(eq(adventurePlans.status, "started"), lte(adventurePlans.startsAt, now)),
      ),
    );
  return rows.map((row) => row.id);
}
