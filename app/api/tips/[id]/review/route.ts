import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { trailTipPurchases, trailTipReviews } from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { emitAnalytics } from "../../../../monetization";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to review this briefing." }, { status: 401 });
  const { id } = await context.params;
  const payload = (await request.json()) as { rating?: number; comment?: string };
  const rating = Math.round(Number(payload.rating));
  const comment = String(payload.comment || "").trim().slice(0, 500);
  if (rating < 1 || rating > 5) return Response.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
  const db = await getDb();
  const [purchase] = await db.select().from(trailTipPurchases).where(and(
    eq(trailTipPurchases.tipId, id),
    eq(trailTipPurchases.buyerEmail, user.email),
    eq(trailTipPurchases.status, "paid"),
  )).limit(1);
  if (!purchase) return Response.json({ error: "Only buyers can review a trail briefing." }, { status: 403 });
  const now = new Date();
  const [review] = await db.insert(trailTipReviews).values({
    id: crypto.randomUUID(), tipId: id, buyerEmail: user.email, rating, comment, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [trailTipReviews.tipId, trailTipReviews.buyerEmail],
    set: { rating, comment, updatedAt: now },
  }).returning();
  await emitAnalytics({ eventName: "trail_tip_reviewed", userEmail: user.email, entityType: "trail_tip", entityId: id, properties: { rating } });
  return Response.json({ review });
}
