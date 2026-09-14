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
import {
  assertMediaObjectExists,
  getMediaBucket,
  mediaUnavailableResponse,
} from "../../../../media-storage";
import { emitAnalytics, getMonetizationConfig, scanTrailTipRisk } from "../../../../monetization";

export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mediaKind(contentType: string): "video" | "photo" | null {
  if (["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) return "video";
  if (["image/jpeg", "image/png", "image/webp"].includes(contentType)) return "photo";
  return null;
}

function normalizeContentType(value: string): string {
  return value.toLowerCase().split(";")[0].trim();
}

function isTipKey(tipId: string, key: string, kind: "full" | "preview"): boolean {
  return new RegExp(`^tips/${tipId}/${kind}\\.[a-z0-9]+$`, "i").test(key);
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

  const contentTypeHeader = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentTypeHeader.includes("application/json")) {
    return Response.json(
      {
        error:
          "Upload media first via /api/uploads/sign + PUT, then POST JSON metadata to create the briefing.",
      },
      { status: 415 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    tipId?: string;
    title?: string;
    description?: string;
    durationSeconds?: number;
    priceCents?: number;
    mediaKey?: string;
    previewKey?: string;
    mediaContentType?: string;
    previewContentType?: string;
  } | null;
  if (!body) return Response.json({ error: "Expected JSON body." }, { status: 400 });

  const tipId = String(body.tipId || "").trim();
  if (!UUID_RE.test(tipId)) {
    return Response.json({ error: "tipId must be a UUID." }, { status: 400 });
  }

  const title = String(body.title || "").trim().slice(0, 90);
  const description = String(body.description || "").trim().slice(0, 800);
  const durationSeconds = Math.round(Number(body.durationSeconds) || 0);
  const config = await getMonetizationConfig();
  const priceCents = Math.max(
    0,
    Math.min(config.tipMaxPriceCents, Math.round(Number(body.priceCents) || config.tipDefaultPriceCents)),
  );
  const mediaKey = String(body.mediaKey || "").trim();
  const previewKey = String(body.previewKey || "").trim();
  const mediaContentType = normalizeContentType(String(body.mediaContentType || ""));
  const previewContentType = normalizeContentType(String(body.previewContentType || ""));

  if (!title || description.length < 20) {
    return Response.json({ error: "Add a clear title and at least 20 characters of useful detail." }, { status: 400 });
  }
  if (durationSeconds < 120 || durationSeconds > 300) {
    return Response.json({ error: "Trail briefings must be between 2 and 5 minutes." }, { status: 400 });
  }
  if (
    mediaContentType.includes("heic") ||
    mediaContentType.includes("heif") ||
    previewContentType.includes("heic") ||
    previewContentType.includes("heif")
  ) {
    return Response.json(
      { error: "Convert HEIC/HEIF photos to JPEG on the device before submitting." },
      { status: 400 },
    );
  }
  if (!ALLOWED_CONTENT_TYPES.has(mediaContentType) || !ALLOWED_CONTENT_TYPES.has(previewContentType)) {
    return Response.json({ error: "Use an MP4, MOV, WebM or photo under 100 MB." }, { status: 400 });
  }
  const mediaType = mediaKind(mediaContentType);
  if (!mediaType) return Response.json({ error: "Unsupported media type." }, { status: 400 });
  if (!isTipKey(tipId, mediaKey, "full") || !isTipKey(tipId, previewKey, "preview")) {
    return Response.json({ error: "mediaKey and previewKey must match tips/{tipId}/…." }, { status: 400 });
  }

  let bucket;
  try {
    bucket = await getMediaBucket();
  } catch (error) {
    const unavailable = mediaUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }

  let mediaMeta;
  let previewMeta;
  try {
    [mediaMeta, previewMeta] = await Promise.all([
      assertMediaObjectExists(bucket, mediaKey),
      assertMediaObjectExists(bucket, previewKey),
    ]);
  } catch {
    return Response.json(
      { error: "Upload the full media and preview objects before creating the briefing." },
      { status: 400 },
    );
  }

  if (mediaMeta.customMetadata?.owner && mediaMeta.customMetadata.owner !== user.email) {
    return Response.json({ error: "Media object owner mismatch." }, { status: 403 });
  }
  if (previewMeta.customMetadata?.owner && previewMeta.customMetadata.owner !== user.email) {
    return Response.json({ error: "Preview object owner mismatch." }, { status: 403 });
  }
  if (mediaMeta.customMetadata?.tipId && mediaMeta.customMetadata.tipId !== tipId) {
    return Response.json({ error: "Media object tipId mismatch." }, { status: 400 });
  }
  if (previewMeta.customMetadata?.tipId && previewMeta.customMetadata.tipId !== tipId) {
    return Response.json({ error: "Preview object tipId mismatch." }, { status: 400 });
  }

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
    thumbnailKey: previewContentType.startsWith("image/") ? previewKey : "",
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
  await emitAnalytics({
    eventName: "trail_tip_submitted",
    userEmail: user.email,
    entityType: "trail_tip",
    entityId: tip.id,
    properties: { trailId, priceCents, riskFlags },
  });
  return Response.json(
    { tip, message: riskFlags.length ? "Submitted for mandatory safety review." : "Submitted for review." },
    { status: 201 },
  );
}
