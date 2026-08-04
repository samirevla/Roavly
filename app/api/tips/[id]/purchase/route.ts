import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  creatorBalances,
  tipCreditsLedger,
  trailTipPurchases,
  trailTips,
} from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import {
  emitAnalytics,
  getMonetizationConfig,
  getOrCreateTipCreditLedger,
} from "../../../../monetization";
import { createStripeCheckout } from "../../../../stripe-billing";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to unlock trail briefings." }, { status: 401 });
  const { id } = await context.params;
  const payload = (await request.json()) as { useCredit?: boolean; tipIds?: string[] };
  const requestedIds = [id, ...(payload.tipIds || [])].map((value) => value.trim()).filter(Boolean);
  const tipIds = [...new Set(requestedIds)].slice(0, 20);
  const db = await getDb();
  const tips = await db.select().from(trailTips).where(inArray(trailTips.id, tipIds));
  if (tips.length !== tipIds.length || tips.some((tip) => tip.status !== "live")) {
    return Response.json({ error: "One of those trail briefings is unavailable." }, { status: 404 });
  }
  if (tips.some((tip) => tip.creatorEmail === user.email)) {
    return Response.json({ error: "Your own trail briefings are already available in your creator library." }, { status: 400 });
  }
  const existing = await db.select().from(trailTipPurchases).where(and(
    eq(trailTipPurchases.buyerEmail, user.email),
    inArray(trailTipPurchases.tipId, tipIds),
    eq(trailTipPurchases.status, "paid"),
  ));
  if (existing.length) return Response.json({ error: "Remove briefings you already own from this purchase." }, { status: 409 });
  const config = await getMonetizationConfig();

  if (payload.useCredit) {
    if (tips.length !== 1) return Response.json({ error: "Use one Roavly+ credit at a time." }, { status: 400 });
    const ledger = await getOrCreateTipCreditLedger(user.email);
    if (!ledger || ledger.creditsUsed >= ledger.creditsTotal) return Response.json({ error: "You have no trail-tip credits left this billing period." }, { status: 402 });
    const consumed = await db.update(tipCreditsLedger)
      .set({ creditsUsed: ledger.creditsUsed + 1, updatedAt: new Date() })
      .where(and(eq(tipCreditsLedger.id, ledger.id), lt(tipCreditsLedger.creditsUsed, tipCreditsLedger.creditsTotal)))
      .returning();
    if (!consumed.length) return Response.json({ error: "That credit was already used. Refresh and try again." }, { status: 409 });
    const tip = tips[0];
    await db.insert(trailTipPurchases).values({
      id: crypto.randomUUID(),
      tipId: tip.id,
      buyerEmail: user.email,
      pricePaidCents: 0,
      platformFeeCents: 0,
      creatorPayoutCents: config.tipCreditCreatorValueCents,
      purchaseSource: "credit",
      status: "paid",
      purchasedAt: new Date(),
      paymentProviderRef: `credit:${ledger.id}:${ledger.creditsUsed + 1}`,
      refundedAt: null,
    });
    await db.insert(creatorBalances).values({
      userEmail: tip.creatorEmail,
      pendingCents: config.tipCreditCreatorValueCents,
      paidCents: 0,
      lifetimeCents: config.tipCreditCreatorValueCents,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: creatorBalances.userEmail,
      set: {
        pendingCents: sql`${creatorBalances.pendingCents} + ${config.tipCreditCreatorValueCents}`,
        lifetimeCents: sql`${creatorBalances.lifetimeCents} + ${config.tipCreditCreatorValueCents}`,
        updatedAt: new Date(),
      },
    });
    await emitAnalytics({ eventName: "trail_tip_credit_redeemed", userEmail: user.email, entityType: "trail_tip", entityId: tip.id, properties: { creatorPayoutCents: config.tipCreditCreatorValueCents } });
    return Response.json({ purchased: true, tipId: tip.id, accessUrl: `/api/tips/${tip.id}/media` });
  }

  const isBundle = tips.length === config.bundleSize;
  const totalCents = isBundle ? config.bundlePriceCents : tips.reduce((total, tip) => total + tip.priceCents, 0);
  const origin = new URL(request.url).origin;
  const checkout = await createStripeCheckout({
    mode: "payment",
    customerEmail: user.email,
    successUrl: `${origin}/?checkout=success&surface=trail-tips`,
    cancelUrl: `${origin}/?checkout=cancelled&surface=trail-tips`,
    metadata: {
      kind: isBundle ? "trail_tip_bundle" : "trail_tip",
      buyer_email: user.email,
      tip_ids: tips.map((tip) => tip.id).join(","),
      total_cents: String(totalCents),
    },
    items: [{
      name: isBundle ? `Roavly trail briefing bundle (${tips.length})` : tips[0].title,
      unitAmountCents: totalCents,
    }],
  });
  if (!checkout?.url) return Response.json({ error: "Payments are not configured yet. Add Stripe keys before accepting purchases." }, { status: 503 });
  await emitAnalytics({ eventName: "tip_checkout_started", userEmail: user.email, entityType: isBundle ? "trail_tip_bundle" : "trail_tip", entityId: tips[0].id, properties: { tipIds, totalCents } });
  return Response.json({ checkoutUrl: checkout.url, sessionId: checkout.id });
}
