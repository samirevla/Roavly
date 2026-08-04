import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { gearTags } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { emitAnalytics } from "../../../monetization";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = await getDb();
  const [tag] = await db.select().from(gearTags).where(eq(gearTags.id, id)).limit(1);
  if (!tag) return new Response("Not found", { status: 404 });
  let destination: URL;
  try { destination = new URL(tag.affiliateUrl); } catch { return new Response("Invalid destination", { status: 500 }); }
  if (!["http:", "https:"].includes(destination.protocol)) return new Response("Invalid destination", { status: 500 });
  await db.update(gearTags).set({ clickCount: sql`${gearTags.clickCount} + 1` }).where(eq(gearTags.id, id));
  const user = await getChatGPTUser();
  await emitAnalytics({ eventName: "gear_affiliate_click", userEmail: user?.email, entityType: tag.targetType, entityId: tag.targetId, properties: { gearTagId: id, brand: tag.brand } });
  return Response.redirect(destination.toString(), 302);
}
