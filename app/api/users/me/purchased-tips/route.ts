import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { profiles, trailTipPurchases, trailTipReviews, trailTips, trails } from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to open your trail-tip library." }, { status: 401 });
  const db = await getDb();
  const purchases = await db.select().from(trailTipPurchases)
    .where(eq(trailTipPurchases.buyerEmail, user.email))
    .orderBy(desc(trailTipPurchases.purchasedAt));
  const paid = purchases.filter((purchase) => purchase.status === "paid");
  const tipIds = paid.map((purchase) => purchase.tipId);
  const tips = tipIds.length ? await db.select().from(trailTips).where(inArray(trailTips.id, tipIds)) : [];
  const trailIds = [...new Set(tips.map((tip) => tip.trailId))];
  const creatorEmails = [...new Set(tips.map((tip) => tip.creatorEmail))];
  const [trailRows, creators, reviews] = await Promise.all([
    trailIds.length ? db.select().from(trails).where(inArray(trails.id, trailIds)) : Promise.resolve([]),
    creatorEmails.length ? db.select().from(profiles).where(inArray(profiles.email, creatorEmails)) : Promise.resolve([]),
    tipIds.length ? db.select().from(trailTipReviews).where(inArray(trailTipReviews.tipId, tipIds)) : Promise.resolve([]),
  ]);
  return Response.json({
    purchases: paid.flatMap((purchase) => {
      const tip = tips.find((item) => item.id === purchase.tipId);
      if (!tip) return [];
      const creator = creators.find((item) => item.email === tip.creatorEmail);
      const review = reviews.find((item) => item.tipId === tip.id && item.buyerEmail === user.email);
      return [{
        ...purchase,
        tip: {
          id: tip.id,
          title: tip.title,
          description: tip.description,
          durationSeconds: tip.durationSeconds,
          mediaType: tip.mediaType,
          mediaUrl: `/api/tips/${tip.id}/media`,
          trail: trailRows.find((trail) => trail.id === tip.trailId) || null,
          creator: { displayName: creator?.displayName || "Roavly creator", username: creator?.username || "roavly.creator" },
        },
        review: review ? { rating: review.rating, comment: review.comment } : null,
      }];
    }),
  });
}
