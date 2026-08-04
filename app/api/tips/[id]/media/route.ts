import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { trailTipPurchases, trailTips } from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getMediaBucket } from "../../../../media-storage";
import { emitAnalytics } from "../../../../monetization";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await context.params;
  const db = await getDb();
  const [tip] = await db.select().from(trailTips).where(eq(trailTips.id, id)).limit(1);
  if (!tip) return new Response("Not found", { status: 404 });
  const isCreator = tip.creatorEmail === user.email;
  const [purchase] = isCreator ? [] : await db.select().from(trailTipPurchases).where(and(
    eq(trailTipPurchases.tipId, id),
    eq(trailTipPurchases.buyerEmail, user.email),
    eq(trailTipPurchases.status, "paid"),
  )).limit(1);
  if (!isCreator && !purchase) return new Response("Purchase required", { status: 403 });
  const object = await (await getMediaBucket()).get(tip.mediaKey);
  if (!object) return new Response("Not found", { status: 404 });
  await emitAnalytics({ eventName: "trail_tip_viewed", userEmail: user.email, entityType: "trail_tip", entityId: id });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
