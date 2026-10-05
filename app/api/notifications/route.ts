import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { SYSTEM_CHAT_AUTHOR } from "../../check-in-overdue";
import { blockedCounterpartEmails } from "../../blocks";
import { getDb } from "../../../db";
import { adventurePlans, notifications, posts, profiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 40;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to see your activity." }, { status: 401 });
  const db = await getDb();

  const [rows, unreadRows, blocked] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientEmail, user.email))
      .orderBy(desc(notifications.createdAt))
      .limit(LIST_LIMIT),
    db
      .select({ id: notifications.id, actorEmail: notifications.actorEmail })
      .from(notifications)
      .where(and(eq(notifications.recipientEmail, user.email), isNull(notifications.readAt))),
    blockedCounterpartEmails(db, user.email),
  ]);

  const visible = rows.filter((row) => !blocked.has(row.actorEmail));
  const actorEmails = Array.from(new Set(visible.map((row) => row.actorEmail)));
  const postIds = Array.from(new Set(visible.map((row) => row.postId).filter((id): id is string => Boolean(id))));
  const planIds = Array.from(new Set(visible.map((row) => row.planId).filter((id): id is string => Boolean(id))));

  const [actors, postRows, planRows] = await Promise.all([
    actorEmails.length ? db.select().from(profiles).where(inArray(profiles.email, actorEmails)) : [],
    postIds.length
      ? db
          .select({ id: posts.id, activityType: posts.activityType, location: posts.location, hiddenAt: posts.hiddenAt })
          .from(posts)
          .where(inArray(posts.id, postIds))
      : [],
    planIds.length
      ? db
          .select({ id: adventurePlans.id, title: adventurePlans.title, status: adventurePlans.status })
          .from(adventurePlans)
          .where(inArray(adventurePlans.id, planIds))
      : [],
  ]);

  const items = visible.flatMap((row) => {
    const actor = actors.find((profile) => profile.email === row.actorEmail);
    const post = row.postId ? postRows.find((item) => item.id === row.postId) : null;
    const plan = row.planId ? planRows.find((item) => item.id === row.planId) : null;
    // Deleted or moderated posts drop out of the inbox so a tap never lands nowhere.
    if (row.postId && (!post || post.hiddenAt)) return [];
    if (row.planId && !plan) return [];
    return [{
      id: row.id,
      type: row.type,
      postId: row.postId,
      planId: row.planId,
      body: row.body,
      read: Boolean(row.readAt),
      createdAt: row.createdAt,
      actorName: row.actorEmail === SYSTEM_CHAT_AUTHOR ? "Waymark" : (actor?.displayName || "Waymark member"),
      actorUsername: actor?.username || "waymark.member",
      actorAvatarUrl: actor?.avatarKey ? `/api/media/${actor.avatarKey}` : null,
      postLabel: post ? [post.activityType, post.location].filter(Boolean).join(" · ") : null,
      planTitle: plan?.title ?? null,
    }];
  });

  return Response.json({
    notifications: items,
    unreadCount: unreadRows.filter((row) => !blocked.has(row.actorEmail)).length,
  });
}

/** Mark read. Body: `{ action: "read_all" }` or `{ action: "read", id }`. */
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to update your activity." }, { status: 401 });
  const payload = (await request.json().catch(() => ({}))) as { action?: string; id?: string };
  const db = await getDb();
  const now = new Date();

  if (payload.action === "read_all") {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.recipientEmail, user.email), isNull(notifications.readAt)));
    return Response.json({ ok: true, unreadCount: 0 });
  }

  if (payload.action === "read" && payload.id) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.id, payload.id),
          eq(notifications.recipientEmail, user.email),
          isNull(notifications.readAt),
        ),
      );
    const unread = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.recipientEmail, user.email), isNull(notifications.readAt)));
    return Response.json({ ok: true, unreadCount: unread.length });
  }

  return Response.json({ error: "Choose read or read_all." }, { status: 400 });
}
