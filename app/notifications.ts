import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "../db";
import { notifications } from "../db/schema";
import { isPairBlocked } from "./blocks";

type Db = Awaited<ReturnType<typeof getDb>>;

export const NOTIFICATION_TYPES = [
  "comment",
  "motivate",
  "plan_request",
  "plan_join",
  "plan_accepted",
  "plan_update",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotifyInput = {
  recipientEmail: string;
  actorEmail: string;
  type: NotificationType;
  postId?: string | null;
  planId?: string | null;
  body?: string;
};

/**
 * Record one activity-inbox row. Never notifies yourself, never crosses a block,
 * and never throws: a failed notification must not break the action that caused it.
 */
export async function notify(db: Db, input: NotifyInput) {
  try {
    if (!input.recipientEmail || input.recipientEmail === input.actorEmail) return false;
    if (await isPairBlocked(db, input.recipientEmail, input.actorEmail)) return false;
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      recipientEmail: input.recipientEmail,
      actorEmail: input.actorEmail,
      type: input.type,
      postId: input.postId ?? null,
      planId: input.planId ?? null,
      body: (input.body || "").slice(0, 240),
      readAt: null,
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    console.error("notify failed", error);
    return false;
  }
}

export async function notifyMany(db: Db, recipients: string[], input: Omit<NotifyInput, "recipientEmail">) {
  const unique = Array.from(new Set(recipients)).filter((email) => email && email !== input.actorEmail);
  let sent = 0;
  for (const recipientEmail of unique) {
    if (await notify(db, { ...input, recipientEmail })) sent += 1;
  }
  return sent;
}

/** One motivate row per actor per post, so toggling does not spam the owner. */
export async function notifyMotivation(db: Db, recipientEmail: string, actorEmail: string, postId: string) {
  try {
    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientEmail, recipientEmail),
          eq(notifications.actorEmail, actorEmail),
          eq(notifications.type, "motivate"),
          eq(notifications.postId, postId),
        ),
      )
      .limit(1);
    if (existing) return false;
  } catch (error) {
    console.error("notifyMotivation lookup failed", error);
    return false;
  }
  return notify(db, { recipientEmail, actorEmail, type: "motivate", postId });
}

/** Removing a motivation withdraws its unread notification. */
export async function withdrawMotivation(db: Db, recipientEmail: string, actorEmail: string, postId: string) {
  try {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.recipientEmail, recipientEmail),
          eq(notifications.actorEmail, actorEmail),
          eq(notifications.type, "motivate"),
          eq(notifications.postId, postId),
          isNull(notifications.readAt),
        ),
      );
  } catch (error) {
    console.error("withdrawMotivation failed", error);
  }
}
