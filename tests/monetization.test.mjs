import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("monetization", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtimeEnv = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const runtimeContext = { waitUntil() {}, passThroughOnException() {} };

test("the monetization migration covers all six revenue streams and their audit data", async () => {
  const schema = await source("db/schema.ts");
  const migration = await source("drizzle/0011_hard_pride.sql");
  for (const table of [
    "trails", "trail_tips", "trail_tip_purchases", "trail_tip_reviews", "creator_status",
    "tip_moderation_audits", "tip_reports", "subscriptions", "tip_credits_ledger",
    "creator_balances", "billing_events", "analytics_events", "gear_tags",
    "business_partners", "partner_placements", "sponsored_challenges",
    "challenge_participants", "ad_campaigns", "ad_impressions",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.ok(migration.includes("CREATE TABLE `" + table + "`"), table);
  }
});

test("trail tips enforce verification, completion, safety review, preview and permanent access", async () => {
  const tipRoute = await source("app/api/trails/[id]/tips/route.ts");
  const purchaseRoute = await source("app/api/tips/[id]/purchase/route.ts");
  const mediaRoute = await source("app/api/tips/[id]/media/route.ts");
  const moderationRoute = await source("app/api/admin/tips/[id]/moderate/route.ts");
  assert.match(tipRoute, /isVerifiedSeller/);
  assert.match(tipRoute, /completedThisTrail/);
  assert.match(tipRoute, /pending_review/);
  assert.match(tipRoute, /scanTrailTipRisk/);
  assert.match(tipRoute, /previewFile/);
  assert.match(purchaseRoute, /useCredit/);
  assert.match(purchaseRoute, /trail_tip_bundle/);
  assert.match(mediaRoute, /Purchase required/);
  assert.match(moderationRoute, /tipModerationAudits/);
  assert.match(moderationRoute, /refundStripeCheckoutSession/);
});

test("billing is webhook-provisioned, signature checked and feature-gated centrally", async () => {
  const billing = await source("app/api/billing/webhook/route.ts");
  const stripe = await source("app/stripe-billing.ts");
  const monetization = await source("app/monetization.ts");
  const saves = await source("app/api/saves/route.ts");
  assert.match(stripe, /verifyStripeWebhook/);
  assert.match(stripe, /timestamp.*rawBody/s);
  assert.match(billing, /billingEvents/);
  assert.match(billing, /customer\.subscription\.updated/);
  assert.match(billing, /invoice\.payment_failed/);
  assert.match(billing, /checkout\.session\.completed/);
  assert.match(monetization, /hasFeature/);
  assert.match(monetization, /offline_maps/);
  assert.match(monetization, /ad_free/);
  assert.match(saves, /SAVE_LIMIT_REACHED/);
});

test("gear, partner, challenge, ad and payout paths are attributable and disclosed", async () => {
  const gear = await source("app/api/gear-tags/route.ts");
  const outbound = await source("app/api/out/[id]/route.ts");
  const partners = await source("app/api/partners/route.ts");
  const challenges = await source("app/api/sponsored-challenges/route.ts");
  const ads = await source("app/api/ads/route.ts");
  const payouts = await source("app/api/creator-payouts/route.ts");
  assert.match(gear, /CURATED_GEAR_CATALOG/);
  assert.match(outbound, /gear_affiliate_click/);
  assert.match(outbound, /Response\.redirect/);
  assert.match(partners, /disclosure/);
  assert.match(challenges, /ownPosts/);
  assert.match(challenges, /sponsored_challenge_joined/);
  assert.match(ads, /PROTECTED_SURFACES/);
  assert.match(ads, /hasFeature\(user\.email, "ad_free"\)/);
  assert.match(payouts, /transferCreatorPayout/);
});

test("the product UI can exercise every revenue flow without seeded paid content", async () => {
  const ui = await source("app/components/monetization-view.tsx");
  const discover = await source("app/components/discover-view.tsx");
  const page = await source("app/page.tsx");
  for (const label of ["Trail tips", "My library", "Create & earn", "Waymark+", "Local partner", "Sponsored challenge", "Native ad campaign"]) {
    assert.match(ui, new RegExp(label.replace(/[+]/g, "\\+"), "i"));
  }
  assert.match(discover, /<MonetizationView/);
  assert.match(page, /<AdSlot placement="feed"/);
  assert.doesNotMatch(ui, /fake purchase|seeded tip|demo seller/i);
});

test("monetization write and library routes reject anonymous callers", async () => {
  const worker = await builtWorker();
  const requests = [
    new Request("http://localhost/api/trails"),
    new Request("http://localhost/api/monetization"),
    new Request("http://localhost/api/users/me/purchased-tips"),
    new Request("http://localhost/api/creator-payouts"),
    new Request("http://localhost/api/tips/example/purchase", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  ];
  for (const request of requests) {
    const response = await worker.fetch(request, runtimeEnv, runtimeContext);
    assert.equal(response.status, 401, request.url);
  }
  const webhook = await worker.fetch(new Request("http://localhost/api/billing/webhook", { method: "POST", body: "{}" }), runtimeEnv, runtimeContext);
  assert.equal(webhook.status, 400);
});
