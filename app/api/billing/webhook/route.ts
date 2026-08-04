import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { billingEvents, creatorBalances, subscriptions, trailTipPurchases, trailTips } from "../../../../db/schema";
import { calculateRevenueSplit, emitAnalytics, getMonetizationConfig } from "../../../monetization";
import { verifyStripeWebhook } from "../../../stripe-billing";

export const dynamic = "force-dynamic";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function metadata(object: Record<string, unknown>) {
  return (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<string, string>;
}

function dateFromSeconds(value: unknown, fallback: Date) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : fallback;
}

async function fulfilTipCheckout(session: Record<string, unknown>) {
  if (stringValue(session.payment_status) !== "paid") return;
  const info = metadata(session);
  const buyerEmail = info.buyer_email || stringValue(session.client_reference_id);
  const tipIds = (info.tip_ids || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!buyerEmail || !tipIds.length) return;
  const db = await getDb();
  const config = await getMonetizationConfig();
  const tips = await db.select().from(trailTips).where(inArray(trailTips.id, tipIds));
  if (tips.length !== tipIds.length) throw new Error("Stripe checkout references missing trail tips.");
  const totalCents = Math.max(0, Number(info.total_cents) || Number(session.amount_total) || 0);
  const weightTotal = tips.reduce((total, tip) => total + tip.priceCents, 0) || tips.length;
  let allocated = 0;
  for (let index = 0; index < tips.length; index += 1) {
    const tip = tips[index];
    const pricePaidCents = index === tips.length - 1
      ? totalCents - allocated
      : Math.round(totalCents * ((tip.priceCents || 1) / weightTotal));
    allocated += pricePaidCents;
    const split = calculateRevenueSplit(pricePaidCents, config.platformFeePercent);
    const inserted = await db.insert(trailTipPurchases).values({
      id: crypto.randomUUID(), tipId: tip.id, buyerEmail, pricePaidCents,
      platformFeeCents: split.platformFeeCents, creatorPayoutCents: split.creatorPayoutCents,
      purchaseSource: tips.length > 1 ? "bundle" : "single", status: "paid", purchasedAt: new Date(),
      paymentProviderRef: stringValue(session.id), refundedAt: null,
    }).onConflictDoNothing({ target: [trailTipPurchases.tipId, trailTipPurchases.buyerEmail] }).returning();
    if (!inserted.length) continue;
    await db.insert(creatorBalances).values({
      userEmail: tip.creatorEmail, pendingCents: split.creatorPayoutCents, paidCents: 0,
      lifetimeCents: split.creatorPayoutCents, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: creatorBalances.userEmail,
      set: {
        pendingCents: sql`${creatorBalances.pendingCents} + ${split.creatorPayoutCents}`,
        lifetimeCents: sql`${creatorBalances.lifetimeCents} + ${split.creatorPayoutCents}`,
        updatedAt: new Date(),
      },
    });
    await emitAnalytics({ eventName: "trail_tip_purchased", userEmail: buyerEmail, entityType: "trail_tip", entityId: tip.id, properties: { pricePaidCents, creatorPayoutCents: split.creatorPayoutCents, source: tips.length > 1 ? "bundle" : "single" } });
  }
}

async function upsertSubscription(object: Record<string, unknown>, fallbackEmail = "", fallbackPlan = "monthly") {
  const info = metadata(object);
  const customerId = stringValue(object.customer);
  const providerRef = stringValue(object.subscription) || stringValue(object.id);
  const db = await getDb();
  let userEmail = info.user_email || fallbackEmail;
  if (!userEmail && customerId) {
    const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
    userEmail = existing?.userEmail || "";
  }
  if (!userEmail) return;
  const rawStatus = metadata(object).kind === "roavly_plus" && stringValue(object.payment_status) === "paid"
    ? "active"
    : stringValue(object.status) || "active";
  const status = ["active", "trialing"].includes(rawStatus) ? "active" : rawStatus === "canceled" ? "canceled" : "past_due";
  const now = new Date();
  const currentPeriodStart = dateFromSeconds(object.current_period_start, now);
  const currentPeriodEnd = dateFromSeconds(object.current_period_end, new Date(now.getTime() + 31 * 86400000));
  await db.insert(subscriptions).values({
    userEmail, plan: info.plan || fallbackPlan, status, currentPeriodStart, currentPeriodEnd,
    stripeCustomerId: customerId || null, paymentProviderRef: providerRef || null, updatedAt: now,
  }).onConflictDoUpdate({
    target: subscriptions.userEmail,
    set: { plan: info.plan || fallbackPlan, status, currentPeriodStart, currentPeriodEnd, stripeCustomerId: customerId || null, paymentProviderRef: providerRef || null, updatedAt: now },
  });
  await emitAnalytics({ eventName: `subscription_${status}`, userEmail, entityType: "subscription", entityId: providerRef, properties: { plan: info.plan || fallbackPlan } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"));
  if (!verified) return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  const event = JSON.parse(rawBody) as StripeEvent;
  const db = await getDb();
  const [processed] = await db.select().from(billingEvents).where(eq(billingEvents.providerEventId, event.id)).limit(1);
  if (processed) return Response.json({ received: true, duplicate: true });
  const object = event.data.object;
  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && metadata(object).kind?.startsWith("trail_tip")) {
    await fulfilTipCheckout(object);
  } else if (event.type === "checkout.session.completed" && metadata(object).kind === "roavly_plus") {
    await upsertSubscription(object, metadata(object).user_email, metadata(object).plan);
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    if (event.type === "customer.subscription.deleted") object.status = "canceled";
    await upsertSubscription(object);
  } else if (event.type === "invoice.payment_failed") {
    const customerId = stringValue(object.customer);
    if (customerId) await db.update(subscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(subscriptions.stripeCustomerId, customerId));
  }
  await db.insert(billingEvents).values({ providerEventId: event.id, eventType: event.type, processedAt: new Date() });
  return Response.json({ received: true });
}
