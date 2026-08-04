import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { gearTags, posts, trailTips } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { CURATED_GEAR_CATALOG } from "../../gear-catalog";
import { emitAnalytics } from "../../monetization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to browse tagged gear." }, { status: 401 });
  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");
  const db = await getDb();
  const tags = targetType && targetId
    ? await db.select().from(gearTags).where(and(eq(gearTags.targetType, targetType), eq(gearTags.targetId, targetId)))
    : [];
  return Response.json({ catalog: CURATED_GEAR_CATALOG, tags: tags.map((tag) => ({ ...tag, affiliateUrl: undefined, outUrl: `/api/out/${tag.id}` })) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to tag gear." }, { status: 401 });
  const payload = (await request.json()) as { targetType?: "post" | "trail_tip"; targetId?: string; catalogId?: string };
  const product = CURATED_GEAR_CATALOG.find((item) => item.id === payload.catalogId);
  if (!product || !payload.targetId || !["post", "trail_tip"].includes(payload.targetType || "")) return Response.json({ error: "Choose a curated product and one of your posts or briefings." }, { status: 400 });
  const db = await getDb();
  const ownsTarget = payload.targetType === "post"
    ? Boolean((await db.select({ owner: posts.authorEmail }).from(posts).where(eq(posts.id, payload.targetId)).limit(1))[0]?.owner === user.email)
    : Boolean((await db.select({ owner: trailTips.creatorEmail }).from(trailTips).where(eq(trailTips.id, payload.targetId)).limit(1))[0]?.owner === user.email);
  if (!ownsTarget) return Response.json({ error: "You can only tag gear on your own content." }, { status: 403 });
  const [tag] = await db.insert(gearTags).values({
    id: crypto.randomUUID(), targetType: payload.targetType!, targetId: payload.targetId,
    productName: product.productName, brand: product.brand, affiliateUrl: product.affiliateUrl,
    clickCount: 0, conversionCount: 0, commissionCents: 0, createdByEmail: user.email, createdAt: new Date(),
  }).returning();
  await emitAnalytics({ eventName: "gear_tag_added", userEmail: user.email, entityType: payload.targetType, entityId: payload.targetId, properties: { catalogId: product.id } });
  return Response.json({ tag: { ...tag, affiliateUrl: undefined, outUrl: `/api/out/${tag.id}` } }, { status: 201 });
}
