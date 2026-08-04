import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { adCampaigns, adImpressions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emitAnalytics, hasFeature } from "../../monetization";

export const dynamic = "force-dynamic";
const PROTECTED_SURFACES = new Set(["trail_tip", "checkout", "onboarding"]);

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ ad: null });
  const placement = new URL(request.url).searchParams.get("placement") || "feed";
  if (PROTECTED_SURFACES.has(placement) || await hasFeature(user.email, "ad_free")) return Response.json({ ad: null });
  const db = await getDb();
  const now = new Date();
  const [ad] = await db.select().from(adCampaigns).where(and(
    eq(adCampaigns.status, "live"), lte(adCampaigns.startDate, now), gte(adCampaigns.endDate, now),
  )).limit(1);
  return Response.json({ ad: ad ? { ...ad, disclosure: "Sponsored" } : null });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const payload = (await request.json()) as { campaignId?: string; placement?: string };
  const placement = String(payload.placement || "feed");
  if (PROTECTED_SURFACES.has(placement) || await hasFeature(user.email, "ad_free")) return Response.json({ recorded: false });
  const db = await getDb();
  const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, String(payload.campaignId || ""))).limit(1);
  if (!campaign || campaign.status !== "live") return Response.json({ error: "Ad campaign not found." }, { status: 404 });
  await db.insert(adImpressions).values({ id: crypto.randomUUID(), campaignId: campaign.id, userEmail: user.email, placement, createdAt: new Date() });
  await emitAnalytics({ eventName: "ad_impression", userEmail: user.email, entityType: "ad_campaign", entityId: campaign.id, properties: { placement } });
  return Response.json({ recorded: true });
}
