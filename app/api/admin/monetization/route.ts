import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  adCampaigns,
  businessPartners,
  creatorStatuses,
  gearTags,
  partnerPlacements,
  sponsoredChallenges,
  tipReports,
  trailTips,
} from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { emitAnalytics, isRoavlyAdmin } from "../../../monetization";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getChatGPTUser();
  return user && await isRoavlyAdmin(user.email) ? user : null;
}

function safeHttpUrl(value: unknown, optional = false) {
  const raw = String(value || "").trim();
  if (!raw && optional) return "";
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use a valid https website URL.");
  return url.toString();
}

function inputDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) throw new Error("Choose valid start and end dates.");
  return date;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Waymark admin access required." }, { status: 403 });
  const db = await getDb();
  const [pendingTips, reports, partners, placements, challenges, ads] = await Promise.all([
    db.select().from(trailTips).where(eq(trailTips.status, "pending_review")).orderBy(desc(trailTips.createdAt)),
    db.select().from(tipReports).where(eq(tipReports.status, "open")).orderBy(desc(tipReports.createdAt)),
    db.select().from(businessPartners).orderBy(desc(businessPartners.createdAt)),
    db.select().from(partnerPlacements).orderBy(desc(partnerPlacements.createdAt)),
    db.select().from(sponsoredChallenges).orderBy(desc(sponsoredChallenges.createdAt)),
    db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt)),
  ]);
  return Response.json({ pendingTips, reports, partners, placements, challenges, ads });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return Response.json({ error: "Waymark admin access required." }, { status: 403 });
  const payload = (await request.json()) as Record<string, unknown>;
  const action = String(payload.action || "");
  const db = await getDb();
  try {
    if (action === "verify_creator") {
      const userEmail = String(payload.userEmail || "").trim().toLowerCase();
      if (!userEmail) throw new Error("Add the creator email.");
      await db.insert(creatorStatuses).values({ userEmail, isVerifiedSeller: true, verificationCriteriaMet: JSON.stringify({ manualApproval: true }), verifiedAt: new Date(), verifiedByEmail: user.email, stripeConnectAccountId: null, updatedAt: new Date() })
        .onConflictDoUpdate({ target: creatorStatuses.userEmail, set: { isVerifiedSeller: true, verifiedAt: new Date(), verifiedByEmail: user.email, updatedAt: new Date() } });
    } else if (action === "create_partner") {
      const now = new Date();
      await db.insert(businessPartners).values({
        id: crypto.randomUUID(), name: String(payload.name || "").trim().slice(0, 100), category: String(payload.category || "Outdoor service").trim().slice(0, 60),
        websiteUrl: safeHttpUrl(payload.websiteUrl), logoUrl: safeHttpUrl(payload.logoUrl, true), latitude: Number(payload.latitude) || null, longitude: Number(payload.longitude) || null,
        radiusKm: Math.max(1, Math.min(500, Number(payload.radiusKm) || 25)), subscriptionTier: String(payload.subscriptionTier || "featured"),
        billingStatus: payload.billingStatus === "active" ? "active" : "inactive", createdAt: now, updatedAt: now,
      });
    } else if (action === "create_placement") {
      const startDate = inputDate(payload.startDate); const endDate = inputDate(payload.endDate);
      if (endDate <= startDate) throw new Error("The placement end date must be after its start date.");
      await db.insert(partnerPlacements).values({
        id: crypto.randomUUID(), businessId: String(payload.businessId || ""), trailId: String(payload.trailId || "") || null,
        activityType: String(payload.activityType || "") || null, placementType: String(payload.placementType || "featured_card"),
        label: "Partner", headline: String(payload.headline || "").trim().slice(0, 140), startDate, endDate, createdAt: new Date(),
      });
    } else if (action === "create_challenge") {
      const startDate = inputDate(payload.startDate); const endDate = inputDate(payload.endDate);
      if (endDate <= startDate) throw new Error("The challenge end date must be after its start date.");
      const metric = ["minutes", "distance_km", "journeys"].includes(String(payload.metric)) ? String(payload.metric) : "minutes";
      await db.insert(sponsoredChallenges).values({
        id: crypto.randomUUID(), title: String(payload.title || "").trim().slice(0, 100), description: String(payload.description || "").trim().slice(0, 600),
        sponsorName: String(payload.sponsorName || "").trim().slice(0, 100), sponsorLogoUrl: safeHttpUrl(payload.sponsorLogoUrl, true), startDate, endDate, metric,
        target: Math.max(1, Number(payload.target) || 1), rules: String(payload.rules || "").trim().slice(0, 1000), prizeDescription: String(payload.prizeDescription || "").trim().slice(0, 400),
        status: payload.status === "live" ? "live" : "draft", createdAt: new Date(),
      });
    } else if (action === "create_ad") {
      const startDate = inputDate(payload.startDate); const endDate = inputDate(payload.endDate);
      if (endDate <= startDate) throw new Error("The campaign end date must be after its start date.");
      await db.insert(adCampaigns).values({
        id: crypto.randomUUID(), advertiserName: String(payload.advertiserName || "").trim().slice(0, 100), headline: String(payload.headline || "").trim().slice(0, 140),
        body: String(payload.body || "").trim().slice(0, 300), imageUrl: safeHttpUrl(payload.imageUrl, true), destinationUrl: safeHttpUrl(payload.destinationUrl),
        activityType: String(payload.activityType || "") || null, startDate, endDate, status: payload.status === "live" ? "live" : "draft", createdAt: new Date(),
      });
    } else if (action === "record_gear_conversion") {
      const tagId = String(payload.gearTagId || "");
      const [tag] = await db.select().from(gearTags).where(eq(gearTags.id, tagId)).limit(1);
      if (!tag) throw new Error("Gear tag not found.");
      await db.update(gearTags).set({ conversionCount: tag.conversionCount + 1, commissionCents: tag.commissionCents + Math.max(0, Number(payload.commissionCents) || 0) }).where(eq(gearTags.id, tagId));
    } else {
      return Response.json({ error: "Unknown admin action." }, { status: 400 });
    }
    await emitAnalytics({ eventName: `admin_${action}`, userEmail: user.email, entityType: "monetization_admin" });
    return Response.json({ saved: true, action });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The admin change could not be saved." }, { status: 400 });
  }
}
