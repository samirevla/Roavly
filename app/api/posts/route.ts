import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getMediaBucket, mediaUnavailableResponse } from "../../media-storage";
import { isApprovedEncouragement } from "../../positive-comments";
import {
  friendlyUploadError,
  photoContentType,
  photoExtension,
  validatePhoto,
} from "../../photo-upload";
import { enforceRateLimit, RATE_LIMITS } from "../../rate-limit";
import { getDb } from "../../../db";
import {
  comments,
  blocks,
  friendships,
  gearTags,
  posts,
  profiles,
  reactions,
  savedJourneys,
} from "../../../db/schema";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return friendlyUploadError(error);
}

export async function GET() {
  const viewer = await getChatGPTUser();
  if (!viewer) {
    return Response.json({ error: "Sign in to view the Waymark feed." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const [rawRows, viewerBlocks] = await Promise.all([
      db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100),
      db
        .select()
        .from(blocks)
        .where(
          or(
            eq(blocks.blockerEmail, viewer.email),
            eq(blocks.blockedEmail, viewer.email),
          ),
        ),
    ]);
    const blockedEmails = new Set(
      viewerBlocks.flatMap((block) => [block.blockerEmail, block.blockedEmail]),
    );
    blockedEmails.delete(viewer.email);
    const rows = rawRows.filter((post) => !blockedEmails.has(post.authorEmail));
    const postIds = rows.map((post) => post.id);
    const [allReactions, allComments, allSaves, viewerFriendships, postGearTags] = await Promise.all([
      postIds.length
        ? db.select().from(reactions).where(inArray(reactions.postId, postIds))
        : Promise.resolve([]),
      postIds.length
        ? db.select().from(comments).where(inArray(comments.postId, postIds)).orderBy(asc(comments.createdAt))
        : Promise.resolve([]),
      postIds.length
        ? db.select().from(savedJourneys).where(inArray(savedJourneys.postId, postIds))
        : Promise.resolve([]),
      db
        .select()
        .from(friendships)
        .where(
          and(
            eq(friendships.status, "accepted"),
            or(
              eq(friendships.userOneEmail, viewer.email),
              eq(friendships.userTwoEmail, viewer.email),
            ),
          ),
        ),
      postIds.length
        ? db.select().from(gearTags).where(and(eq(gearTags.targetType, "post"), inArray(gearTags.targetId, postIds)))
        : Promise.resolve([]),
    ]);
    const profileEmails = Array.from(
      new Set([
        ...rows.map((post) => post.authorEmail),
        ...allComments.map((comment) => comment.authorEmail),
      ]),
    );
    const authorProfiles = profileEmails.length
      ? await db.select().from(profiles).where(inArray(profiles.email, profileEmails))
      : [];

    const enriched = rows.map((post) => {
      const { authorEmail, ...publicPost } = post;
      const postReactions = allReactions.filter((reaction) => reaction.postId === post.id);
      const author = authorProfiles.find((profile) => profile.email === authorEmail);
      const postSaves = allSaves.filter((save) => save.postId === post.id);
      const inspiredPosts = rows.filter((item) => item.inspiredByPostId === post.id);
      const viewerIsFriend = viewerFriendships.some(
        (friendship) =>
          friendship.userOneEmail === authorEmail || friendship.userTwoEmail === authorEmail,
      );
      const canSeeExact =
        authorEmail === viewer.email ||
        post.locationPrivacy === "exact" ||
        (post.locationPrivacy === "friends" && viewerIsFriend);
      const latitude =
        post.latitude == null || canSeeExact
          ? post.latitude
          : Math.round(post.latitude * 100) / 100;
      const longitude =
        post.longitude == null || canSeeExact
          ? post.longitude
          : Math.round(post.longitude * 100) / 100;
      const locationParts = post.location.split(",").map((part) => part.trim()).filter(Boolean);
      const location =
        canSeeExact || locationParts.length < 3
          ? post.location
          : locationParts.slice(-2).join(", ");
      return {
        ...publicPost,
        location,
        latitude,
        longitude,
        placeId: canSeeExact ? post.placeId : null,
        locationPrecision: canSeeExact ? "exact" : "approximate",
        authorName: author?.displayName || post.authorName,
        authorUsername: author?.username || "waymark.member",
        imageUrl: `/api/media/${post.imageKey}`,
        motivationCount: postReactions.length,
        viewerMotivated: postReactions.some((reaction) => reaction.userEmail === viewer.email),
        saveCount: postSaves.length,
        viewerSaved: postSaves.some((save) => save.userEmail === viewer.email),
        viewerSaveStatus:
          postSaves.find((save) => save.userEmail === viewer.email)?.status || "none",
        inspiredCount: inspiredPosts.length,
        inspiredMinutes: inspiredPosts.reduce(
          (total, inspiredPost) => total + inspiredPost.durationMinutes,
          0,
        ),
        isOwner: authorEmail === viewer.email,
        gear: postGearTags.filter((tag) => tag.targetId === post.id).map((tag) => ({
          id: tag.id,
          brand: tag.brand,
          productName: tag.productName,
          outUrl: `/api/out/${tag.id}`,
        })),
        comments: allComments
          .filter((comment) => comment.postId === post.id && isApprovedEncouragement(comment.body))
          .map((comment) => {
            const commentAuthor = authorProfiles.find((profile) => profile.email === comment.authorEmail);
            return {
              id: comment.id,
              postId: comment.postId,
              body: comment.body,
              createdAt: comment.createdAt,
              authorName: commentAuthor?.displayName || "Waymark member",
              authorUsername: commentAuthor?.username || "waymark.member",
              canDelete:
                comment.authorEmail === viewer.email || authorEmail === viewer.email,
            };
          }),
      };
    });
    return Response.json({ posts: enriched });
  } catch (error) {
    const unavailable = mediaUnavailableResponse(error);
    if (unavailable) return unavailable;
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to share a journey." }, { status: 401 });
  }
  const limited = enforceRateLimit(`posts:${user.email}`, RATE_LIMITS.posts);
  if (limited) return limited;

  let imageKey = "";
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    const caption = String(form.get("caption") || "").trim();
    const activityType = String(form.get("activityType") || "Outdoor adventure").trim().slice(0, 50);
    const rawLocation = String(form.get("location") || "").trim();
    const location = rawLocation.slice(0, 160);
    const latitude = Number(form.get("latitude"));
    const longitude = Number(form.get("longitude"));
    const placeId = String(form.get("placeId") || "").trim().slice(0, 255);
    const requestedLocationPrivacy = ["approximate", "friends", "exact"].includes(
      String(form.get("locationPrivacy")),
    )
      ? String(form.get("locationPrivacy"))
      : "approximate";
    const distanceKm = Math.max(0, Math.min(500, Number(form.get("distanceKm")) || 0));
    const durationMinutes = Math.max(1, Math.min(10080, Number(form.get("durationMinutes")) || 0));
    const elevationMetres = Math.max(0, Math.min(10000, Number(form.get("elevationMetres")) || 0));
    const difficulty = String(form.get("difficulty") || "Moderate").trim().slice(0, 40);
    const tips = String(form.get("tips") || "").trim().slice(0, 400);
    const conditions = String(form.get("conditions") || "").trim().slice(0, 200);
    const parkingInfo = String(form.get("parkingInfo") || "").trim().slice(0, 200);
    const phoneSignal = String(form.get("phoneSignal") || "Unknown").trim().slice(0, 30);
    const toilets = String(form.get("toilets") || "Unknown").trim().slice(0, 30);
    const accessibility = String(form.get("accessibility") || "").trim().slice(0, 240);
    const dogFriendly = String(form.get("dogFriendly") || "Unknown").trim().slice(0, 30);
    const bestTime = String(form.get("bestTime") || "").trim().slice(0, 120);
    const inspiredByPostId = String(form.get("inspiredByPostId") || "").trim().slice(0, 80) || null;

    if (
      !photo ||
      typeof photo === "string" ||
      typeof photo.arrayBuffer !== "function"
    ) {
      return Response.json({ error: "Choose a photo for your journey." }, { status: 400 });
    }
    const photoError = validatePhoto(photo);
    if (photoError) {
      return Response.json({ error: photoError }, { status: 400 });
    }
    if (!caption || caption.length > 500) {
      return Response.json({ error: "Write a caption between 1 and 500 characters." }, { status: 400 });
    }
    if (!Number(form.get("durationMinutes")) || Number(form.get("durationMinutes")) < 1) {
      return Response.json({ error: "Add how many minutes you spent outdoors." }, { status: 400 });
    }
    if (!rawLocation || rawLocation.length > 160) {
      return Response.json({ error: "Choose a location from Google Maps." }, { status: 400 });
    }
    if (!placeId) {
      return Response.json({ error: "Select a valid Google Maps location." }, { status: 400 });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return Response.json({ error: "The selected latitude is invalid." }, { status: 400 });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return Response.json({ error: "The selected longitude is invalid." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const contentType = photoContentType(photo)!;
    imageKey = `posts/${id}.${photoExtension(contentType)}`;
    const bucket = await getMediaBucket();
    await bucket.put(imageKey, await photo.arrayBuffer(), {
      httpMetadata: { contentType },
      customMetadata: { owner: user.email, postId: id },
    });

    const db = await getDb();
    const [profile] = await db.select().from(profiles).where(eq(profiles.email, user.email)).limit(1);
    const locationPrivacy =
      profile?.ageBand === "18+" ? requestedLocationPrivacy : "approximate";
    const [post] = await db
      .insert(posts)
      .values({
        id,
        authorEmail: user.email,
        authorName: profile?.displayName || user.displayName,
        caption,
        activityType,
        location,
        latitude,
        longitude,
        placeId,
        locationPrivacy,
        distanceKm,
        durationMinutes,
        elevationMetres,
        difficulty,
        tips,
        conditions,
        parkingInfo,
        phoneSignal,
        toilets,
        accessibility,
        dogFriendly,
        bestTime,
        inspiredByPostId,
        imageKey,
        createdAt: new Date(),
      })
      .returning();

    if (inspiredByPostId) {
      const [source] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, inspiredByPostId))
        .limit(1);
      if (source) {
        const [saved] = await db
          .select()
          .from(savedJourneys)
          .where(
            and(
              eq(savedJourneys.postId, inspiredByPostId),
              eq(savedJourneys.userEmail, user.email),
            ),
          )
          .limit(1);
        if (saved) {
          await db
            .update(savedJourneys)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(savedJourneys.id, saved.id));
        }
      }
    }

    const publicPost = {
      id: post.id,
      authorName: post.authorName,
      caption: post.caption,
      activityType: post.activityType,
      location: post.location,
      latitude: post.latitude,
      longitude: post.longitude,
      placeId: post.placeId,
      locationPrivacy: post.locationPrivacy,
      locationPrecision: "exact",
      distanceKm: post.distanceKm,
      durationMinutes: post.durationMinutes,
      elevationMetres: post.elevationMetres,
      difficulty: post.difficulty,
      tips: post.tips,
      conditions: post.conditions,
      parkingInfo: post.parkingInfo,
      phoneSignal: post.phoneSignal,
      toilets: post.toilets,
      accessibility: post.accessibility,
      dogFriendly: post.dogFriendly,
      bestTime: post.bestTime,
      inspiredByPostId: post.inspiredByPostId,
      imageKey: post.imageKey,
      createdAt: post.createdAt,
    };
    return Response.json(
      {
        post: {
          ...publicPost,
          authorUsername: profile?.username || "waymark.member",
          imageUrl: `/api/media/${imageKey}`,
          motivationCount: 0,
          viewerMotivated: false,
          saveCount: 0,
          viewerSaved: false,
          viewerSaveStatus: "none",
          inspiredCount: 0,
          inspiredMinutes: 0,
          isOwner: true,
          comments: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const unavailable = mediaUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (imageKey) {
      try {
        const bucket = await getMediaBucket();
        await bucket.delete(imageKey);
      } catch {
        // Best-effort cleanup after a failed post write.
      }
    }
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
