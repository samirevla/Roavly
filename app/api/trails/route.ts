import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { posts, trails } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emitAnalytics } from "../../monetization";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to browse trail briefings." }, { status: 401 });
  const db = await getDb();
  const rows = await db.select().from(trails).orderBy(asc(trails.name)).limit(250);
  return Response.json({ trails: rows });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to add a trail." }, { status: 401 });
  const payload = (await request.json()) as { postId?: string };
  const postId = payload.postId?.trim();
  if (!postId) return Response.json({ error: "Choose one of your completed journey posts." }, { status: 400 });
  const db = await getDb();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post || post.authorEmail !== user.email) {
    return Response.json({ error: "Only your own completed journey can create a trail listing." }, { status: 403 });
  }
  if (!post.placeId) return Response.json({ error: "That journey has no verified map location." }, { status: 400 });
  const [existing] = await db.select().from(trails).where(eq(trails.placeId, post.placeId)).limit(1);
  if (existing) return Response.json({ trail: existing });
  const [trail] = await db.insert(trails).values({
    id: crypto.randomUUID(),
    name: post.location.split(",")[0]?.trim() || post.caption.slice(0, 80),
    location: post.location,
    placeId: post.placeId,
    latitude: post.latitude,
    longitude: post.longitude,
    difficulty: post.difficulty,
    distanceKm: post.distanceKm,
    createdByEmail: user.email,
    createdAt: new Date(),
  }).returning();
  await emitAnalytics({ eventName: "trail_created", userEmail: user.email, entityType: "trail", entityId: trail.id });
  return Response.json({ trail }, { status: 201 });
}
