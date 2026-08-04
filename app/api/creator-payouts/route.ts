import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { creatorBalances, creatorStatuses } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emitAnalytics } from "../../monetization";
import { createStripeConnectOnboarding, transferCreatorPayout } from "../../stripe-billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view creator payouts." }, { status: 401 });
  const db = await getDb();
  const [status, balance] = await Promise.all([
    db.select().from(creatorStatuses).where(eq(creatorStatuses.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
    db.select().from(creatorBalances).where(eq(creatorBalances.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
  ]);
  return Response.json({ verified: Boolean(status?.isVerifiedSeller), connected: Boolean(status?.stripeConnectAccountId), balance: balance || { pendingCents: 0, paidCents: 0, lifetimeCents: 0 } });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to manage creator payouts." }, { status: 401 });
  const payload = (await request.json()) as { action?: "onboard" | "payout" };
  const db = await getDb();
  const [status] = await db.select().from(creatorStatuses).where(eq(creatorStatuses.userEmail, user.email)).limit(1);
  if (!status?.isVerifiedSeller) return Response.json({ error: "Verified seller status is required for payouts." }, { status: 403 });
  if (payload.action === "onboard") {
    const origin = new URL(request.url).origin;
    const onboarding = await createStripeConnectOnboarding({ email: user.email, existingAccountId: status.stripeConnectAccountId, refreshUrl: `${origin}/?surface=trail-tips&payout=refresh`, returnUrl: `${origin}/?surface=trail-tips&payout=connected` });
    await db.update(creatorStatuses).set({ stripeConnectAccountId: onboarding.accountId, updatedAt: new Date() }).where(eq(creatorStatuses.userEmail, user.email));
    return Response.json({ onboardingUrl: onboarding.url });
  }
  if (payload.action === "payout") {
    if (!status.stripeConnectAccountId) return Response.json({ error: "Connect your payout account first." }, { status: 400 });
    const [balance] = await db.select().from(creatorBalances).where(eq(creatorBalances.userEmail, user.email)).limit(1);
    const amountCents = balance?.pendingCents || 0;
    if (amountCents < 1000) return Response.json({ error: "Creator payouts become available at $10.00." }, { status: 400 });
    const transfer = await transferCreatorPayout({ accountId: status.stripeConnectAccountId, amountCents, creatorEmail: user.email });
    await db.update(creatorBalances).set({ pendingCents: 0, paidCents: sql`${creatorBalances.paidCents} + ${amountCents}`, updatedAt: new Date() }).where(eq(creatorBalances.userEmail, user.email));
    await emitAnalytics({ eventName: "creator_payout_sent", userEmail: user.email, entityType: "stripe_transfer", entityId: transfer.id, properties: { amountCents } });
    return Response.json({ paid: true, transferId: transfer.id, amountCents });
  }
  return Response.json({ error: "Choose a payout action." }, { status: 400 });
}
