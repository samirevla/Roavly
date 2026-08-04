import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { getDb } from "../../../../../../db";
import { comments, posts } from "../../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to delete comments." }, { status: 401 });

  const { id: postId, commentId } = await context.params;
  const db = await getDb();
  const [[post], [comment]] = await Promise.all([
    db
      .select({ authorEmail: posts.authorEmail })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1),
    db
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.postId, postId)))
      .limit(1),
  ]);

  if (!post || !comment) {
    return Response.json({ error: "That encouragement no longer exists." }, { status: 404 });
  }
  if (comment.authorEmail !== user.email && post.authorEmail !== user.email) {
    return Response.json(
      { error: "Only the comment author or journey owner can delete this encouragement." },
      { status: 403 },
    );
  }

  await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.postId, postId)));
  return Response.json({ deleted: true, commentId });
}
