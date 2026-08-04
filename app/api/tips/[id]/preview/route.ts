import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { trailTips } from "../../../../../db/schema";
import { getMediaBucket } from "../../../../media-storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const db = await getDb();
  const [tip] = await db.select().from(trailTips).where(eq(trailTips.id, id)).limit(1);
  if (!tip || tip.status !== "live") return new Response("Not found", { status: 404 });
  const object = await (await getMediaBucket()).get(tip.previewKey);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
