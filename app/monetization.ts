import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import {
  analyticsEvents,
  subscriptions,
  tipCreditsLedger,
} from "../db/schema";

export type RoavlyFeature =
  | "offline_maps"
  | "unlimited_saved_trips"
  | "ad_free"
  | "tip_credits"
  | "advanced_routes"
  | "profile_badge";

type RuntimeConfig = {
  tipDefaultPriceCents: number;
  tipMaxPriceCents: number;
  platformFeePercent: number;
  plusCreditsPerPeriod: number;
  tipCreditCreatorValueCents: number;
  freeSavedTripsLimit: number;
  bundleSize: number;
  bundlePriceCents: number;
  sellerFollowerThreshold: number;
  sellerUpvoteThreshold: number;
  adminEmails: string[];
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeMonthlyPriceId: string;
  stripeAnnualPriceId: string;
  currency: string;
};

const PLUS_FEATURES = new Set<RoavlyFeature>([
  "offline_maps",
  "unlimited_saved_trips",
  "ad_free",
  "tip_credits",
  "advanced_routes",
  "profile_badge",
]);

function intSetting(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export async function getMonetizationConfig(): Promise<RuntimeConfig> {
  let settings = (globalThis as typeof globalThis & { __ROAVLY_TEST_ENV__?: Record<string, unknown> }).__ROAVLY_TEST_ENV__ || {};
  try {
    const { env } = await import("cloudflare:workers");
    settings = env as unknown as Record<string, unknown>;
  } catch {
    // Node-based route tests do not expose the Cloudflare runtime module.
  }
  return {
    tipDefaultPriceCents: intSetting(settings.ROAVLY_TIP_DEFAULT_PRICE_CENTS, 99, 0, 499),
    tipMaxPriceCents: intSetting(settings.ROAVLY_TIP_MAX_PRICE_CENTS, 499, 99, 5000),
    platformFeePercent: intSetting(settings.ROAVLY_PLATFORM_FEE_PERCENT, 30, 0, 100),
    plusCreditsPerPeriod: intSetting(settings.ROAVLY_PLUS_TIP_CREDITS, 3, 0, 100),
    tipCreditCreatorValueCents: intSetting(settings.ROAVLY_TIP_CREDIT_VALUE_CENTS, 69, 0, 499),
    freeSavedTripsLimit: intSetting(settings.ROAVLY_FREE_SAVE_LIMIT, 10, 1, 1000),
    bundleSize: intSetting(settings.ROAVLY_TIP_BUNDLE_SIZE, 5, 2, 20),
    bundlePriceCents: intSetting(settings.ROAVLY_TIP_BUNDLE_PRICE_CENTS, 399, 1, 10000),
    sellerFollowerThreshold: intSetting(settings.ROAVLY_SELLER_FOLLOWER_THRESHOLD, 25, 0, 1_000_000),
    sellerUpvoteThreshold: intSetting(settings.ROAVLY_SELLER_UPVOTE_THRESHOLD, 50, 0, 1_000_000),
    adminEmails: String(settings.ROAVLY_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    stripeSecretKey: String(settings.STRIPE_SECRET_KEY || ""),
    stripeWebhookSecret: String(settings.STRIPE_WEBHOOK_SECRET || ""),
    stripeMonthlyPriceId: String(settings.STRIPE_ROAVLY_PLUS_MONTHLY_PRICE_ID || ""),
    stripeAnnualPriceId: String(settings.STRIPE_ROAVLY_PLUS_ANNUAL_PRICE_ID || ""),
    currency: String(settings.ROAVLY_BILLING_CURRENCY || "usd").toLowerCase(),
  };
}

export async function isRoavlyAdmin(email: string) {
  const config = await getMonetizationConfig();
  return config.adminEmails.includes(email.toLowerCase());
}

export async function getEntitlements(userEmail: string) {
  const db = await getDb();
  const now = new Date();
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userEmail, userEmail),
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, now),
      ),
    )
    .limit(1);
  const tier = subscription ? "plus" : "free";
  return {
    tier,
    subscription: subscription || null,
    features: Object.fromEntries(
      (["offline_maps", "unlimited_saved_trips", "ad_free", "tip_credits", "advanced_routes", "profile_badge"] as RoavlyFeature[])
        .map((feature) => [feature, tier === "plus" && PLUS_FEATURES.has(feature)]),
    ) as Record<RoavlyFeature, boolean>,
  };
}

export async function hasFeature(userEmail: string, feature: RoavlyFeature) {
  const entitlements = await getEntitlements(userEmail);
  return entitlements.features[feature];
}

export async function getOrCreateTipCreditLedger(userEmail: string) {
  const entitlements = await getEntitlements(userEmail);
  if (entitlements.tier !== "plus" || !entitlements.subscription) return null;
  const db = await getDb();
  const config = await getMonetizationConfig();
  const periodStart = entitlements.subscription.currentPeriodStart;
  const periodEnd = entitlements.subscription.currentPeriodEnd;
  const [existing] = await db
    .select()
    .from(tipCreditsLedger)
    .where(
      and(
        eq(tipCreditsLedger.userEmail, userEmail),
        eq(tipCreditsLedger.periodStart, periodStart),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(tipCreditsLedger)
    .values({
      id: crypto.randomUUID(),
      userEmail,
      periodStart,
      periodEnd,
      creditsTotal: config.plusCreditsPerPeriod,
      creditsUsed: 0,
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export function calculateRevenueSplit(grossCents: number, feePercent: number) {
  const platformFeeCents = Math.round(grossCents * (feePercent / 100));
  return {
    platformFeeCents,
    creatorPayoutCents: grossCents - platformFeeCents,
  };
}

export function scanTrailTipRisk(text: string) {
  const riskyTerms = ["cliff", "ice", "exposed", "off-trail", "off trail", "shortcut", "scramble", "river crossing"];
  const normalised = text.toLowerCase();
  return riskyTerms.filter((term) => normalised.includes(term));
}

export async function emitAnalytics(input: {
  eventName: string;
  userEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  properties?: Record<string, unknown>;
}) {
  const db = await getDb();
  await db.insert(analyticsEvents).values({
    id: crypto.randomUUID(),
    eventName: input.eventName,
    userEmail: input.userEmail || null,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    properties: JSON.stringify(input.properties || {}),
    createdAt: new Date(),
  });
}

export async function activeSubscriptionByCustomer(customerId: string) {
  const db = await getDb();
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1)
    .then((rows) => rows[0] || null);
}
