import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { isApprovedEncouragement } from "../../../../positive-comments";
import { getDb } from "../../../../../db";
import { comments, posts, profiles } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to comment." }, { status: 401 });
  const { id: postId } = await context.params;
  const payload = (await request.json()) as { body?: string };
  const body = payload.body?.trim() || "";
  if (!isApprovedEncouragement(body)) {
    return Response.json(
      { error: "Choose one of Waymark’s positive encouragements." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return Response.json({ error: "This post no longer exists." }, { status: 404 });
  const [profile] = await db.select().from(profiles).where(eq(profiles.email, user.email)).limit(1);
  const [comment] = await db
    .insert(comments)
    .values({
      id: crypto.randomUUID(),
      postId,
      authorEmail: user.email,
      body,
      createdAt: new Date(),
    })
    .returning();
  return Response.json(
    {
      comment: {
        id: comment.id,
        postId: comment.postId,
        body: comment.body,
        createdAt: comment.createdAt,
        authorName: profile?.displayName || user.displayName,
        authorUsername: profile?.username || "waymark.member",
        canDelete: true,
      },
    },
    { status: 201 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view comments." }, { status: 401 });
  const { id: postId } = await context.params;
  const db = await getDb();
  const [post] = await db
    .select({ authorEmail: posts.authorEmail })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return Response.json({ error: "This post no longer exists." }, { status: 404 });
  const rows = await db.select().from(comments).where(eq(comments.postId, postId)).orderBy(asc(comments.createdAt));
  const allProfiles = await db.select().from(profiles);
  return Response.json({
    comments: rows.filter((comment) => isApprovedEncouragement(comment.body)).map((comment) => {
      const author = allProfiles.find((profile) => profile.email === comment.authorEmail);
      return {
        id: comment.id,
        postId: comment.postId,
        body: comment.body,
        createdAt: comment.createdAt,
        authorName: author?.displayName || "Waymark member",
        authorUsername: author?.username || "waymark.member",
        canDelete:
          comment.authorEmail === user.email || post.authorEmail === user.email,
      };
    }),
  });
}
