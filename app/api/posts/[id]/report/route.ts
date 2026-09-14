import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { enforceRateLimit, RATE_LIMITS } from "../../../../rate-limit";
import { getDb } from "../../../../../db";
import { posts, reports } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to report a post." }, { status: 401 });
  const limited = enforceRateLimit(`report:${user.email}`, RATE_LIMITS.report);
  if (limited) return limited;
  const { id: postId } = await context.params;
  const payload = (await request.json()) as { reason?: string };
  const reason = payload.reason?.trim().slice(0, 200) || "Community safety concern";
  const db = await getDb();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return Response.json({ error: "This post no longer exists." }, { status: 404 });
  if (post.authorEmail === user.email) {
    return Response.json({ error: "You cannot report your own post." }, { status: 400 });
  }
  await db
    .insert(reports)
    .values({
      id: crypto.randomUUID(),
      postId,
      reporterEmail: user.email,
      reason,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return Response.json({ reported: true });
}
