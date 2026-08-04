import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { creatorStatuses, friendships, posts, reactions, trails } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getMonetizationConfig } from "../../monetization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to view creator eligibility." }, { status: 401 });
  const trailId = new URL(request.url).searchParams.get("trailId") || "";
  const db = await getDb();
  const config = await getMonetizationConfig();
  const [ownPosts, acceptedFriends, selectedTrail, stored] = await Promise.all([
    db.select().from(posts).where(eq(posts.authorEmail, user.email)),
    db.select().from(friendships).where(and(
      eq(friendships.status, "accepted"),
      or(eq(friendships.userOneEmail, user.email), eq(friendships.userTwoEmail, user.email)),
    )),
    trailId ? db.select().from(trails).where(eq(trails.id, trailId)).limit(1).then((rows) => rows[0] || null) : Promise.resolve(null),
    db.select().from(creatorStatuses).where(eq(creatorStatuses.userEmail, user.email)).limit(1).then((rows) => rows[0] || null),
  ]);
  const ownPostIds = ownPosts.map((post) => post.id);
  const upvotes = ownPostIds.length
    ? await db.select().from(reactions).where(inArray(reactions.postId, ownPostIds))
    : [];
  const completedSelectedTrail = Boolean(selectedTrail && ownPosts.some((post) =>
    (selectedTrail.placeId && post.placeId === selectedTrail.placeId) ||
    post.location.toLowerCase() === selectedTrail.location.toLowerCase(),
  ));
  const hasAnyVerifiedCompletion = ownPosts.some((post) => Boolean(post.placeId));
  const communityThresholdMet = acceptedFriends.length >= config.sellerFollowerThreshold || upvotes.length >= config.sellerUpvoteThreshold;
  const automaticallyEligible = hasAnyVerifiedCompletion && communityThresholdMet;
  const isVerifiedSeller = Boolean(stored?.isVerifiedSeller || automaticallyEligible);
  const criteria = {
    completedTrailCount: ownPosts.filter((post) => Boolean(post.placeId)).length,
    completedSelectedTrail,
    friendCount: acceptedFriends.length,
    communityUpvotes: upvotes.length,
    followerThreshold: config.sellerFollowerThreshold,
    upvoteThreshold: config.sellerUpvoteThreshold,
    communityThresholdMet,
  };
  if (!stored || JSON.stringify(criteria) !== stored.verificationCriteriaMet || automaticallyEligible !== stored.isVerifiedSeller) {
    await db.insert(creatorStatuses).values({
      userEmail: user.email,
      isVerifiedSeller,
      verificationCriteriaMet: JSON.stringify(criteria),
      verifiedAt: isVerifiedSeller ? stored?.verifiedAt || new Date() : null,
      verifiedByEmail: stored?.verifiedByEmail || null,
      stripeConnectAccountId: stored?.stripeConnectAccountId || null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: creatorStatuses.userEmail,
      set: {
        isVerifiedSeller,
        verificationCriteriaMet: JSON.stringify(criteria),
        verifiedAt: isVerifiedSeller ? stored?.verifiedAt || new Date() : null,
        updatedAt: new Date(),
      },
    });
  }
  return Response.json({
    isVerifiedSeller,
    criteria,
    canSubmitForTrail: isVerifiedSeller && (!trailId || completedSelectedTrail),
  });
}
