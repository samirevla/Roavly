import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { enforceRateLimit, RATE_LIMITS } from "../../../../rate-limit";
import { getDb } from "../../../../../db";
import { posts, reactions } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to motivate this journey." }, { status: 401 });
  }
  const limited = enforceRateLimit(`motivate:${user.email}`, RATE_LIMITS.motivate);
  if (limited) return limited;

  const { id: postId } = await context.params;
  const db = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) {
    return Response.json({ error: "This post no longer exists." }, { status: 404 });
  }
  const [existing] = await db
    .select()
    .from(reactions)
    .where(and(eq(reactions.postId, postId), eq(reactions.userEmail, user.email)))
    .limit(1);

  if (existing) {
    await db.delete(reactions).where(eq(reactions.id, existing.id));
  } else {
    await db.insert(reactions).values({
      id: crypto.randomUUID(),
      postId,
      userEmail: user.email,
      createdAt: new Date(),
    });
  }

  const countRows = await db
    .select()
    .from(reactions)
    .where(eq(reactions.postId, postId));

  return Response.json({
    motivated: !existing,
    motivationCount: countRows.length,
  });
}
