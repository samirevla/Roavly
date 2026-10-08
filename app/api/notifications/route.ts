import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { SYSTEM_CHAT_AUTHOR, syncOverdueCheckIns } from "../../check-in-overdue";
import { blockedCounterpartEmails } from "../../blocks";
import { getDb } from "../../../db";
import { adventurePlans, notifications, planMembers, posts, profiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 40;

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * The bell polls this route, so it is the quickest place to notice a missed check-in on a
 * journey the viewer is on. Activity rows only (idempotent ids); never blocks the inbox.
 */
async function syncViewerOverdueActivity(db: Db, email: string) {
  try {
    const now = new Date();
    const memberships = await db
      .select({ planId: planMembers.planId })
      .from(planMembers)
      .where(and(eq(planMembers.userEmail, email), eq(planMembers.status, "accepted")));
    const memberPlanIds = memberships.map((row) => row.planId);
    const plans = await db
      .select({ id: adventurePlans.id })
      .from(adventurePlans)
      .where(
        and(
          or(
            eq(adventurePlans.hostEmail, email),
            ...(memberPlanIds.length ? [inArray(adventurePlans.id, memberPlanIds)] : []),
          ),
          inArray(adventurePlans.status, ["open", "scheduled", "started"]),
          or(eq(adventurePlans.status, "started"), lte(adventurePlans.startsAt, now)),
        ),
      );
    if (plans.length) {
      await syncOverdueCheckIns(db, plans.map((plan) => plan.id), now, { activityOnly: true });
    }
  } catch (error) {
    console.error("overdue activity sync failed", error);
  }
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to see your activity." }, { status: 401 });
  const db = await getDb();
  await syncViewerOverdueActivity(db, user.email);

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
