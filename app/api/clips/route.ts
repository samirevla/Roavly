import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { mediaUnavailableResponse } from "../../media-storage";
import { friendlyUploadError } from "../../photo-upload";
import { getDb } from "../../../db";
import { blocks, friendships, posts, profiles, reactions } from "../../../db/schema";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export async function GET() {
  const viewer = await getChatGPTUser();
  if (!viewer) {
    return Response.json({ error: "Sign in to view Waymark clips." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const [rawRows, viewerBlocks] = await Promise.all([
      db
        .select()
        .from(posts)
        .where(eq(posts.mediaType, "video"))
        .orderBy(desc(posts.createdAt))
        .limit(PAGE_SIZE),
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

    const [allReactions, viewerFriendships, authorProfiles] = await Promise.all([
      postIds.length
        ? db.select().from(reactions).where(inArray(reactions.postId, postIds))
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
      rows.length
        ? db
            .select()
            .from(profiles)
            .where(inArray(profiles.email, Array.from(new Set(rows.map((post) => post.authorEmail)))))
        : Promise.resolve([]),
    ]);

    const clips = rows.map((post) => {
      const author = authorProfiles.find((profile) => profile.email === post.authorEmail);
      const postReactions = allReactions.filter((reaction) => reaction.postId === post.id);
      const viewerIsFriend = viewerFriendships.some(
        (friendship) =>
          friendship.userOneEmail === post.authorEmail ||
          friendship.userTwoEmail === post.authorEmail,
      );
      const canSeeExact =
        post.authorEmail === viewer.email ||
        post.locationPrivacy === "exact" ||
        (post.locationPrivacy === "friends" && viewerIsFriend);
      const locationParts = post.location.split(",").map((part) => part.trim()).filter(Boolean);
      const location =
        canSeeExact || locationParts.length < 3
          ? post.location
          : locationParts.slice(-2).join(", ");

      return {
        id: post.id,
        caption: post.caption,
        activityType: post.activityType,
        location,
        mediaType: "video" as const,
        imageUrl: `/api/media/${post.imageKey}`,
        mediaUrl: `/api/media/${post.imageKey}`,
        authorName: author?.displayName || post.authorName,
        authorUsername: author?.username || "waymark.member",
        authorAvatarUrl: author?.avatarKey ? `/api/media/${author.avatarKey}` : null,
        motivationCount: postReactions.length,
        viewerMotivated: postReactions.some((reaction) => reaction.userEmail === viewer.email),
        createdAt: post.createdAt,
      };
    });

    return Response.json({ clips });
  } catch (error) {
    const unavailable = mediaUnavailableResponse(error);
    if (unavailable) return unavailable;
    return Response.json(
      { error: friendlyUploadError(error) },
      { status: 500 },
    );
  }
}
