import { and, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { businessPartners, partnerPlacements } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emitAnalytics } from "../../monetization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to browse trail partners." }, { status: 401 });
  const url = new URL(request.url);
  const trailId = url.searchParams.get("trailId");
  const activityType = url.searchParams.get("activityType");
  const db = await getDb();
  const now = new Date();
  const active = await db.select().from(partnerPlacements).where(and(
    lte(partnerPlacements.startDate, now), gte(partnerPlacements.endDate, now),
  ));
  const placements = active.filter((placement) =>
    (!placement.trailId || placement.trailId === trailId) &&
    (!placement.activityType || placement.activityType === activityType),
  );
  const businessIds = [...new Set(placements.map((placement) => placement.businessId))];
  const businesses = businessIds.length ? await db.select().from(businessPartners).where(inArray(businessPartners.id, businessIds)) : [];
  const result = placements.flatMap((placement) => {
    const business = businesses.find((item) => item.id === placement.businessId);
    if (!business || business.billingStatus !== "active") return [];
    return [{ ...placement, disclosure: placement.label || "Partner", business: { id: business.id, name: business.name, category: business.category, websiteUrl: business.websiteUrl, logoUrl: business.logoUrl } }];
  });
  for (const placement of result) await emitAnalytics({ eventName: "partner_placement_viewed", userEmail: user.email, entityType: "partner_placement", entityId: placement.id, properties: { businessId: placement.businessId } });
  return Response.json({ placements: result });
}
