import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { enforceRateLimit, RATE_LIMITS } from "../../rate-limit";
import { getDb } from "../../../db";
import { chatMessages, comments, contentReports, posts } from "../../../db/schema";

export const dynamic = "force-dynamic";

type TargetType = "comment" | "message";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to report content." }, { status: 401 });
  const limited = enforceRateLimit(`report:${user.email}`, RATE_LIMITS.report);
  if (limited) return limited;

  const payload = (await request.json()) as {
    targetType?: TargetType;
    targetId?: string;
    reason?: string;
  };
  const targetType = payload.targetType;
  const targetId = payload.targetId?.trim();
  const reason = payload.reason?.trim().slice(0, 200) || "Community safety concern";

  if (!targetId || (targetType !== "comment" && targetType !== "message")) {
    return Response.json(
      { error: "Choose a comment or message to report." },
      { status: 400 },
    );
  }

  const db = await getDb();

  if (targetType === "comment") {
    const [comment] = await db.select().from(comments).where(eq(comments.id, targetId)).limit(1);
    if (!comment) return Response.json({ error: "That encouragement no longer exists." }, { status: 404 });
    if (comment.authorEmail === user.email) {
      return Response.json({ error: "You cannot report your own encouragement." }, { status: 400 });
    }
    const [post] = await db.select().from(posts).where(eq(posts.id, comment.postId)).limit(1);
    if (!post) return Response.json({ error: "That encouragement no longer exists." }, { status: 404 });
  } else {
    const [message] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, targetId))
      .limit(1);
    if (!message) return Response.json({ error: "That message no longer exists." }, { status: 404 });
    if (message.authorEmail === user.email) {
      return Response.json({ error: "You cannot report your own message." }, { status: 400 });
    }
  }

  await db
    .insert(contentReports)
    .values({
      id: crypto.randomUUID(),
      targetType,
      targetId,
      reporterEmail: user.email,
      reason,
      status: "open",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return Response.json({ reported: true });
}
