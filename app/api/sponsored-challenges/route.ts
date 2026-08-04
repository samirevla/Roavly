import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { challengeParticipants, posts, sponsoredChallenges } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { emitAnalytics } from "../../monetization";

export const dynamic = "force-dynamic";

function challengeValue(metric: string, activityRows: { durationMinutes: number; distanceKm: number }[]) {
  if (metric === "minutes") return activityRows.reduce((total, post) => total + post.durationMinutes, 0);
  if (metric === "distance_km") return Math.round(activityRows.reduce((total, post) => total + post.distanceKm, 0));
  return activityRows.length;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to browse community challenges." }, { status: 401 });
  const db = await getDb();
  const now = new Date();
  const challenges = await db.select().from(sponsoredChallenges).where(and(
    eq(sponsoredChallenges.status, "live"), lte(sponsoredChallenges.startDate, now), gte(sponsoredChallenges.endDate, now),
  )).orderBy(desc(sponsoredChallenges.startDate));
  const memberships = await db.select().from(challengeParticipants).where(eq(challengeParticipants.userEmail, user.email));
  const ownPosts = await db.select().from(posts).where(eq(posts.authorEmail, user.email));
  const result = [];
  for (const challenge of challenges) {
    const relevantPosts = ownPosts.filter((post) => post.createdAt >= challenge.startDate && post.createdAt <= challenge.endDate);
    const value = challengeValue(challenge.metric, relevantPosts);
    const membership = memberships.find((item) => item.challengeId === challenge.id);
    if (membership) {
      await db.update(challengeParticipants).set({
        progress: JSON.stringify({ value, metric: challenge.metric }),
        completedAt: value >= challenge.target ? membership.completedAt || new Date() : null,
      }).where(eq(challengeParticipants.id, membership.id));
    }
    result.push({ ...challenge, progress: value, complete: value >= challenge.target, joined: Boolean(membership) });
  }
  return Response.json({ challenges: result });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to join a challenge." }, { status: 401 });
  const payload = (await request.json()) as { challengeId?: string };
  const challengeId = String(payload.challengeId || "").trim();
  const db = await getDb();
  const [challenge] = await db.select().from(sponsoredChallenges).where(eq(sponsoredChallenges.id, challengeId)).limit(1);
  if (!challenge || challenge.status !== "live") return Response.json({ error: "That challenge is not open." }, { status: 404 });
  await db.insert(challengeParticipants).values({ id: crypto.randomUUID(), challengeId, userEmail: user.email, progress: "{}", joinedAt: new Date(), completedAt: null })
    .onConflictDoNothing({ target: [challengeParticipants.challengeId, challengeParticipants.userEmail] });
  await emitAnalytics({ eventName: "sponsored_challenge_joined", userEmail: user.email, entityType: "sponsored_challenge", entityId: challengeId, properties: { sponsorName: challenge.sponsorName } });
  return Response.json({ joined: true });
}
