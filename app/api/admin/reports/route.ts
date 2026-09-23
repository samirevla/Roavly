import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  chatMessages,
  comments,
  contentReports,
  posts,
  reports,
} from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { isRoavlyAdmin } from "../../../monetization";

export const dynamic = "force-dynamic";

type TriageAction = "resolve" | "dismiss";

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user && (await isRoavlyAdmin(user.email)) ? user : null;
}

function snippetOf(text: string | null | undefined, max = 160) {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Waymark moderator access required." }, { status: 403 });

  const db = await getDb();
  const openRows = await db
    .select()
    .from(contentReports)
    .where(eq(contentReports.status, "open"))
    .orderBy(desc(contentReports.createdAt));

  const postIds = [
    ...new Set(openRows.filter((row) => row.targetType === "post").map((row) => row.targetId)),
  ];
  const commentIds = [
    ...new Set(openRows.filter((row) => row.targetType === "comment").map((row) => row.targetId)),
  ];
  const messageIds = [
    ...new Set(openRows.filter((row) => row.targetType === "message").map((row) => row.targetId)),
  ];

  const [postRows, commentRows, messageRows, legacyPostReports] = await Promise.all([
    postIds.length
      ? db.select().from(posts).where(inArray(posts.id, postIds))
      : Promise.resolve([] as (typeof posts.$inferSelect)[]),
    commentIds.length
      ? db.select().from(comments).where(inArray(comments.id, commentIds))
      : Promise.resolve([] as (typeof comments.$inferSelect)[]),
    messageIds.length
      ? db.select().from(chatMessages).where(inArray(chatMessages.id, messageIds))
      : Promise.resolve([] as (typeof chatMessages.$inferSelect)[]),
    db.select().from(reports).orderBy(desc(reports.createdAt)),
  ]);

  const postsById = new Map(postRows.map((row) => [row.id, row]));
  const commentsById = new Map(commentRows.map((row) => [row.id, row]));
  const messagesById = new Map(messageRows.map((row) => [row.id, row]));

  // Any content_reports row (open or triaged) suppresses the matching legacy post report.
  const allPostContentReports = await db
    .select({
      targetId: contentReports.targetId,
      reporterEmail: contentReports.reporterEmail,
    })
    .from(contentReports)
    .where(eq(contentReports.targetType, "post"));
  const coveredPostKeys = new Set(
    allPostContentReports.map(
      (row) => `${row.targetId}:${row.reporterEmail.toLowerCase()}`,
    ),
  );

  const inbox = openRows.map((row) => {
    let snippet = "";
    let authorEmail: string | null = null;
    if (row.targetType === "post") {
      const post = postsById.get(row.targetId);
      snippet = snippetOf(post?.caption);
      authorEmail = post?.authorEmail ?? null;
    } else if (row.targetType === "comment") {
      const comment = commentsById.get(row.targetId);
      snippet = snippetOf(comment?.body);
      authorEmail = comment?.authorEmail ?? null;
    } else if (row.targetType === "message") {
      const message = messagesById.get(row.targetId);
      snippet = snippetOf(message?.body);
      authorEmail = message?.authorEmail ?? null;
    }
    return {
      id: row.id,
      source: "content_reports" as const,
      targetType: row.targetType,
      targetId: row.targetId,
      reporterEmail: row.reporterEmail,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
      snippet,
      authorEmail,
      contentMissing: !snippet && !authorEmail,
    };
  });

  // Surface legacy post reports (pre-content_reports dual-write) as open items.
  const legacyPostIds = [...new Set(legacyPostReports.map((row) => row.postId))];
  const legacyPosts = legacyPostIds.length
    ? await db.select().from(posts).where(inArray(posts.id, legacyPostIds))
    : [];
  const legacyPostsById = new Map(legacyPosts.map((row) => [row.id, row]));

  for (const row of legacyPostReports) {
    const key = `${row.postId}:${row.reporterEmail.toLowerCase()}`;
    if (coveredPostKeys.has(key)) continue;
    const post = legacyPostsById.get(row.postId);
    inbox.push({
      id: `legacy:${row.id}`,
      source: "content_reports" as const,
      targetType: "post",
      targetId: row.postId,
      reporterEmail: row.reporterEmail,
      reason: row.reason,
      status: "open",
      createdAt: row.createdAt,
      snippet: snippetOf(post?.caption),
      authorEmail: post?.authorEmail ?? null,
      contentMissing: !post,
    });
  }

  inbox.sort((a, b) => {
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt) || 0;
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt) || 0;
    return bTime - aTime;
  });

  return Response.json({ reports: inbox, count: inbox.length });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Waymark moderator access required." }, { status: 403 });

  const payload = (await request.json()) as {
    reportId?: string;
    action?: TriageAction;
  };
  const reportId = String(payload.reportId || "").trim();
  const action = payload.action;
  if (!reportId || (action !== "resolve" && action !== "dismiss")) {
    return Response.json({ error: "Choose a report and resolve or dismiss it." }, { status: 400 });
  }

  const db = await getDb();
  const nextStatus = action === "resolve" ? "resolved" : "dismissed";

  if (reportId.startsWith("legacy:")) {
    const legacyId = reportId.slice("legacy:".length);
    const [legacy] = await db.select().from(reports).where(eq(reports.id, legacyId)).limit(1);
    if (!legacy) return Response.json({ error: "That report is no longer open." }, { status: 404 });

    // Promote into content_reports so triage history is retained, then drop the legacy row.
    await db
      .insert(contentReports)
      .values({
        id: crypto.randomUUID(),
        targetType: "post",
        targetId: legacy.postId,
        reporterEmail: legacy.reporterEmail,
        reason: legacy.reason,
        status: nextStatus,
        createdAt: legacy.createdAt,
      })
      .onConflictDoNothing();
    await db
      .update(contentReports)
      .set({ status: nextStatus })
      .where(
        and(
          eq(contentReports.targetType, "post"),
          eq(contentReports.targetId, legacy.postId),
          eq(contentReports.reporterEmail, legacy.reporterEmail),
        ),
      );
    await db.delete(reports).where(eq(reports.id, legacyId));
    return Response.json({ updated: true, action, status: nextStatus });
  }

  const [existing] = await db
    .select()
    .from(contentReports)
    .where(eq(contentReports.id, reportId))
    .limit(1);
  if (!existing) return Response.json({ error: "That report is no longer open." }, { status: 404 });
  if (existing.status !== "open") {
    return Response.json({ error: "That report was already triaged." }, { status: 400 });
  }

  await db
    .update(contentReports)
    .set({ status: nextStatus })
    .where(eq(contentReports.id, reportId));

  if (existing.targetType === "post") {
    await db
      .delete(reports)
      .where(
        and(
          eq(reports.postId, existing.targetId),
          eq(reports.reporterEmail, existing.reporterEmail),
        ),
      );
  }

  return Response.json({ updated: true, action, status: nextStatus });
}
