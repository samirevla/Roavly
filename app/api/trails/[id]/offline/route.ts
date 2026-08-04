import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { posts, trails } from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { emitAnalytics, hasFeature } from "../../../../monetization";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to download a trail." }, { status: 401 });
  if (!(await hasFeature(user.email, "offline_maps"))) return Response.json({ error: "Offline trail downloads are included with Roavly+." }, { status: 402 });
  const { id } = await context.params;
  const db = await getDb();
  const [trail] = await db.select().from(trails).where(eq(trails.id, id)).limit(1);
  if (!trail) return Response.json({ error: "Trail not found." }, { status: 404 });
  const relatedPosts = trail.placeId
    ? await db.select().from(posts).where(eq(posts.placeId, trail.placeId))
    : [];
  const document = {
    version: 1,
    downloadedAt: new Date().toISOString(),
    trail: { id: trail.id, name: trail.name, location: trail.location, latitude: trail.latitude, longitude: trail.longitude, difficulty: trail.difficulty, distanceKm: trail.distanceKm },
    communityNotes: relatedPosts.slice(0, 20).map((post) => ({
      activityType: post.activityType, difficulty: post.difficulty, durationMinutes: post.durationMinutes,
      conditions: post.conditions, tips: post.tips, parkingInfo: post.parkingInfo, bestTime: post.bestTime,
    })),
    safety: "Conditions change. Check official park alerts and carry a suitable offline navigation source before leaving.",
  };
  await emitAnalytics({ eventName: "offline_trail_downloaded", userEmail: user.email, entityType: "trail", entityId: id });
  return new Response(JSON.stringify(document, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="roavly-${trail.id}.json"` },
  });
}
