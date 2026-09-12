import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { creatorBalances, creatorStatuses, trailTips } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getEntitlements, getMonetizationConfig, getOrCreateTipCreditLedger, isRoavlyAdmin } from "../../monetization";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to open Waymark rewards." }, { status: 401 });
  const db = await getDb();
  const [entitlements, config, creator, creatorTips, balance, admin] = await Promise.all([
    getEntitlements(user.email),
    getMonetizationConfig(),
    db.select().from(creatorStatuses).where(eq(creatorStatuses.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
    db.select().from(trailTips).where(eq(trailTips.creatorEmail, user.email)).orderBy(desc(trailTips.createdAt)),
    db.select().from(creatorBalances).where(eq(creatorBalances.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
    isRoavlyAdmin(user.email),
  ]);
  const creditLedger = entitlements.tier === "plus" ? await getOrCreateTipCreditLedger(user.email) : null;
  return Response.json({
    entitlements,
    credits: creditLedger ? { total: creditLedger.creditsTotal, used: creditLedger.creditsUsed, remaining: Math.max(0, creditLedger.creditsTotal - creditLedger.creditsUsed), periodEnd: creditLedger.periodEnd } : null,
    creator: creator ? { ...creator, verificationCriteriaMet: JSON.parse(creator.verificationCriteriaMet || "{}"), balance } : null,
    creatorTips: creatorTips.map((tip) => ({ ...tip, previewUrl: tip.status === "live" ? `/api/tips/${tip.id}/preview` : null })),
    isAdmin: admin,
    pricing: {
      defaultPriceCents: config.tipDefaultPriceCents,
      maxPriceCents: config.tipMaxPriceCents,
      platformFeePercent: config.platformFeePercent,
      bundleSize: config.bundleSize,
      bundlePriceCents: config.bundlePriceCents,
      currency: config.currency,
      freeSavedTripsLimit: config.freeSavedTripsLimit,
      plusCreditsPerPeriod: config.plusCreditsPerPeriod,
    },
    billingReady: Boolean(config.stripeSecretKey && config.stripeMonthlyPriceId && config.stripeAnnualPriceId),
  });
}
