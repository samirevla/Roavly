import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getMediaBucket } from "../../../media-storage";
import { getDb } from "../../../../db";
import { comments, posts, reactions, reports } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to delete a post." }, { status: 401 });
  const { id } = await context.params;
  const db = await getDb();
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.authorEmail, user.email)))
    .limit(1);
  if (!post) return Response.json({ error: "Post not found or not yours." }, { status: 404 });

  await Promise.all([
    db.delete(reactions).where(eq(reactions.postId, id)),
    db.delete(comments).where(eq(comments.postId, id)),
    db.delete(reports).where(eq(reports.postId, id)),
  ]);
  await db.delete(posts).where(eq(posts.id, id));
  if (post.imageKey.startsWith("posts/")) {
    try {
      const bucket = await getMediaBucket();
      await bucket.delete(post.imageKey);
    } catch {
      // The post is deleted even if old media cleanup needs a later retry.
    }
  }
  return Response.json({ deleted: true });
}
