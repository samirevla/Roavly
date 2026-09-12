import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { creatorBalances, tipCreditsLedger, tipModerationAudits, trailTipPurchases, trailTips } from "../../../../../../db/schema";
import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { emitAnalytics, isRoavlyAdmin } from "../../../../../monetization";
import { refundStripeCheckoutSession } from "../../../../../stripe-billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user || !(await isRoavlyAdmin(user.email))) return Response.json({ error: "Waymark moderator access required." }, { status: 403 });
  const { id } = await context.params;
  const payload = (await request.json()) as { action?: "approve" | "reject" | "pull_down" | "refund"; notes?: string };
  const action = payload.action;
  const notes = String(payload.notes || "").trim().slice(0, 1000);
  if (!action || (!["approve", "reject", "pull_down", "refund"] as string[]).includes(action)) return Response.json({ error: "Choose a valid moderation decision." }, { status: 400 });
  if ((action === "reject" || action === "pull_down") && notes.length < 5) return Response.json({ error: "Add a reason for the creator and audit trail." }, { status: 400 });
  const db = await getDb();
  const [tip] = await db.select().from(trailTips).where(eq(trailTips.id, id)).limit(1);
  if (!tip) return Response.json({ error: "Trail briefing not found." }, { status: 404 });

  if (action === "refund") {
    const tipPurchases = await db.select().from(trailTipPurchases).where(eq(trailTipPurchases.tipId, id));
    const paidForTip = tipPurchases.filter((purchase) => purchase.status === "paid");
    const stripeSessions = [...new Set(paidForTip.map((purchase) => purchase.paymentProviderRef || "").filter((ref) => ref.startsWith("cs_")))];
    for (const sessionId of stripeSessions) await refundStripeCheckoutSession(sessionId);
    const bundlePurchases = stripeSessions.length
      ? await db.select().from(trailTipPurchases).where(inArray(trailTipPurchases.paymentProviderRef, stripeSessions))
      : [];
    const paid = [...paidForTip, ...bundlePurchases]
      .filter((purchase, index, all) => purchase.status === "paid" && all.findIndex((item) => item.id === purchase.id) === index);
    const purchasedTipIds = [...new Set(paid.map((purchase) => purchase.tipId))];
    const purchasedTips = purchasedTipIds.length ? await db.select().from(trailTips).where(inArray(trailTips.id, purchasedTipIds)) : [];
    const refundedAt = new Date();
    for (const purchase of paid) {
      await db.update(trailTipPurchases).set({ status: "refunded", refundedAt }).where(eq(trailTipPurchases.id, purchase.id));
      if (purchase.purchaseSource === "credit" && purchase.paymentProviderRef?.startsWith("credit:")) {
        const ledgerId = purchase.paymentProviderRef.split(":")[1];
        if (ledgerId) await db.update(tipCreditsLedger).set({ creditsUsed: sql`MAX(${tipCreditsLedger.creditsUsed} - 1, 0)`, updatedAt: refundedAt }).where(eq(tipCreditsLedger.id, ledgerId));
      }
      const purchaseTip = purchasedTips.find((item) => item.id === purchase.tipId);
      if (!purchaseTip) continue;
      await db.update(creatorBalances).set({
        pendingCents: sql`MAX(${creatorBalances.pendingCents} - ${purchase.creatorPayoutCents}, 0)`,
        lifetimeCents: sql`MAX(${creatorBalances.lifetimeCents} - ${purchase.creatorPayoutCents}, 0)`,
        updatedAt: refundedAt,
      }).where(eq(creatorBalances.userEmail, purchaseTip.creatorEmail));
    }
  } else {
    const status = action === "approve" ? "live" : action === "reject" ? "rejected" : "rejected";
    await db.update(trailTips).set({ status, rejectionReason: status === "rejected" ? notes : "", updatedAt: new Date() }).where(eq(trailTips.id, id));
  }
  await db.insert(tipModerationAudits).values({
    id: crypto.randomUUID(), tipId: id, moderatorEmail: user.email, decision: action, notes,
    riskFlags: tip.riskFlags, createdAt: new Date(),
  });
  await emitAnalytics({ eventName: `trail_tip_${action}`, userEmail: user.email, entityType: "trail_tip", entityId: id });
  return Response.json({ moderated: true, action });
}
