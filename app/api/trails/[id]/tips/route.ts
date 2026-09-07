import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import {
  creatorStatuses,
  posts,
  profiles,
  trailTipPurchases,
  trailTipReviews,
  trailTips,
  trails,
} from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getMediaBucket } from "../../../../media-storage";
import { emitAnalytics, getMonetizationConfig, scanTrailTipRisk } from "../../../../monetization";

export const dynamic = "force-dynamic";

function safeMediaType(file: File) {
  if (["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) return "video";
  if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) return "photo";
  return null;
}

function extension(contentType: string) {
  return ({
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  } as Record<string, string>)[contentType] || "bin";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to browse trail briefings." }, { status: 401 });
  const { id } = await context.params;
  const db = await getDb();
  const [trail] = await db.select().from(trails).where(eq(trails.id, id)).limit(1);
  if (!trail) return Response.json({ error: "Trail not found." }, { status: 404 });
  const tips = await db.select().from(trailTips)
    .where(and(eq(trailTips.trailId, id), eq(trailTips.status, "live")))
    .orderBy(desc(trailTips.createdAt));
  const tipIds = tips.map((tip) => tip.id);
  const creatorEmails = [...new Set(tips.map((tip) => tip.creatorEmail))];
  const [reviews, purchases, creatorProfiles, creatorPosts] = await Promise.all([
    tipIds.length ? db.select().from(trailTipReviews).where(inArray(trailTipReviews.tipId, tipIds)) : Promise.resolve([]),
    tipIds.length ? db.select().from(trailTipPurchases).where(and(
      inArray(trailTipPurchases.tipId, tipIds),
      eq(trailTipPurchases.buyerEmail, user.email),
      eq(trailTipPurchases.status, "paid"),
    )) : Promise.resolve([]),
    creatorEmails.length ? db.select().from(profiles).where(inArray(profiles.email, creatorEmails)) : Promise.resolve([]),
    creatorEmails.length ? db.select().from(posts).where(inArray(posts.authorEmail, creatorEmails)) : Promise.resolve([]),
  ]);
  const enriched = tips.map((tip) => {
    const tipReviews = reviews.filter((review) => review.tipId === tip.id);
    const profile = creatorProfiles.find((item) => item.email === tip.creatorEmail);
    return {
      id: tip.id,
      trailId: tip.trailId,
      title: tip.title,
      description: tip.description,
      durationSeconds: tip.durationSeconds,
      priceCents: tip.priceCents,
      mediaType: tip.mediaType,
      previewUrl: `/api/tips/${tip.id}/preview`,
      thumbnailUrl: tip.thumbnailKey ? `/api/tips/${tip.id}/preview` : null,
      createdAt: tip.createdAt,
      creator: {
        displayName: profile?.displayName || "Waymark creator",
        username: profile?.username || "waymark.creator",
        hikeCount: creatorPosts.filter((post) => post.authorEmail === tip.creatorEmail).length,
      },
      rating: tipReviews.length ? Number((tipReviews.reduce((total, review) => total + review.rating, 0) / tipReviews.length).toFixed(1)) : null,
      reviewCount: tipReviews.length,
      purchased: purchases.some((purchase) => purchase.tipId === tip.id) || tip.creatorEmail === user.email,
    };
  }).sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  await emitAnalytics({ eventName: "trail_tips_viewed", userEmail: user.email, entityType: "trail", entityId: id, properties: { count: enriched.length } });
  return Response.json({ trail, tips: enriched });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to submit a trail briefing." }, { status: 401 });
  const { id: trailId } = await context.params;
  const db = await getDb();
  const [trail, creator] = await Promise.all([
    db.select().from(trails).where(eq(trails.id, trailId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(creatorStatuses).where(eq(creatorStatuses.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
  ]);
  if (!trail) return Response.json({ error: "Trail not found." }, { status: 404 });
  if (!creator?.isVerifiedSeller) return Response.json({ error: "Trail briefings are limited to verified sellers." }, { status: 403 });
  const completed = await db.select({ id: posts.id, placeId: posts.placeId, location: posts.location })
    .from(posts).where(eq(posts.authorEmail, user.email));
  const completedThisTrail = completed.some((post) =>
    (trail.placeId && post.placeId === trail.placeId) || post.location.toLowerCase() === trail.location.toLowerCase(),
  );
  if (!completedThisTrail) return Response.json({ error: "Complete and post this trail before briefing it." }, { status: 403 });

  const form = await request.formData();
  const title = String(form.get("title") || "").trim().slice(0, 90);
  const description = String(form.get("description") || "").trim().slice(0, 800);
  const durationSeconds = Math.round(Number(form.get("durationSeconds")) || 0);
  const config = await getMonetizationConfig();
  const priceCents = Math.max(0, Math.min(config.tipMaxPriceCents, Math.round(Number(form.get("priceCents")) || config.tipDefaultPriceCents)));
  const media = form.get("media");
  const preview = form.get("preview");
  if (!title || description.length < 20) return Response.json({ error: "Add a clear title and at least 20 characters of useful detail." }, { status: 400 });
  if (durationSeconds < 120 || durationSeconds > 300) return Response.json({ error: "Trail briefings must be between 2 and 5 minutes." }, { status: 400 });
  if (!(media instanceof File)) return Response.json({ error: "Choose a briefing video or photo narration." }, { status: 400 });
  const mediaType = safeMediaType(media);
  if (!mediaType || media.size > 100 * 1024 * 1024) return Response.json({ error: "Use an MP4, MOV, WebM or photo under 100 MB." }, { status: 400 });
  if (mediaType === "video" && !(preview instanceof File)) return Response.json({ error: "Add a 15-second preview clip or still image." }, { status: 400 });
  const previewFile = preview instanceof File ? preview : media;
  if (!safeMediaType(previewFile) || previewFile.size > 15 * 1024 * 1024) return Response.json({ error: "Preview files must be a supported video or image under 15 MB." }, { status: 400 });

  const tipId = crypto.randomUUID();
  const mediaKey = `tips/${tipId}/full.${extension(media.type)}`;
  const previewKey = `tips/${tipId}/preview.${extension(previewFile.type)}`;
  const bucket = await getMediaBucket();
  await bucket.put(mediaKey, await media.arrayBuffer(), { httpMetadata: { contentType: media.type }, customMetadata: { owner: user.email, tipId, access: "paid" } });
  await bucket.put(previewKey, await previewFile.arrayBuffer(), { httpMetadata: { contentType: previewFile.type }, customMetadata: { owner: user.email, tipId, access: "preview" } });
  const riskFlags = scanTrailTipRisk(`${title} ${description}`);
  const now = new Date();
  const [tip] = await db.insert(trailTips).values({
    id: tipId,
    trailId,
    creatorEmail: user.email,
    title,
    description,
    mediaKey,
    previewKey,
    thumbnailKey: previewFile.type.startsWith("image/") ? previewKey : "",
    mediaType,
    durationSeconds,
    priceCents,
    status: "pending_review",
    riskFlags: JSON.stringify(riskFlags),
    moderationRequired: true,
    rejectionReason: "",
    createdAt: now,
    updatedAt: now,
  }).returning();
  await emitAnalytics({ eventName: "trail_tip_submitted", userEmail: user.email, entityType: "trail_tip", entityId: tip.id, properties: { trailId, priceCents, riskFlags } });
  return Response.json({ tip, message: riskFlags.length ? "Submitted for mandatory safety review." : "Submitted for review." }, { status: 201 });
}
