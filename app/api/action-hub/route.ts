import { asc, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  adventurePlans,
  clubMembers,
  clubs,
  conversations,
  planMembers,
  posts,
  profiles,
  safetyProfiles,
  savedJourneys,
} from "../../../db/schema";

export const dynamic = "force-dynamic";

const challengeDefinitions = [
  {
    id: "fresh-air-10",
    title: "10 Hours Outside",
    description: "Build a steady outdoor habit at your own pace.",
    metric: "minutes",
    target: 600,
  },
  {
    id: "activity-mix",
    title: "Try Three Activities",
    description: "Mix up how you move outdoors.",
    metric: "activities",
    target: 3,
  },
  {
    id: "weekend-streak",
    title: "Five Weekend Adventures",
    description: "Make weekends feel bigger, one journey at a time.",
    metric: "weekends",
    target: 5,
  },
  {
    id: "future-trails",
    title: "Save Five Adventures",
    description: "Build a shortlist of places that make you want to go.",
    metric: "saves",
    target: 5,
  },
] as const;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to open your adventure hub." }, { status: 401 });

  const db = await getDb();
  const [
    allProfiles,
    userSaves,
    allPlans,
    allPlanMembers,
    allClubs,
    allClubMembers,
    ownPosts,
    safetyRows,
    journeyChats,
  ] = await Promise.all([
    db.select().from(profiles),
    db.select().from(savedJourneys).where(eq(savedJourneys.userEmail, user.email)).orderBy(desc(savedJourneys.createdAt)),
    db
      .select()
      .from(adventurePlans)
      .orderBy(asc(adventurePlans.startsAt)),
    db.select().from(planMembers),
    db.select().from(clubs).orderBy(desc(clubs.createdAt)),
    db.select().from(clubMembers),
    db.select().from(posts).where(eq(posts.authorEmail, user.email)).orderBy(desc(posts.createdAt)),
    db.select().from(safetyProfiles).where(eq(safetyProfiles.userEmail, user.email)).limit(1),
    db.select().from(conversations).where(eq(conversations.purpose, "journey")),
  ]);

  const now = new Date();
  const autoStartingPlans = allPlans.filter(
    (plan) =>
      (plan.status === "open" || plan.status === "scheduled") &&
      plan.startsAt.getTime() <= now.getTime(),
  );
  for (const plan of autoStartingPlans) {
    await db
      .update(adventurePlans)
      .set({ status: "started", startedAt: plan.startsAt, updatedAt: now })
      .where(eq(adventurePlans.id, plan.id));
  }
  const autoStartedIds = new Set(autoStartingPlans.map((plan) => plan.id));
  const normalisedPlans = allPlans.map((plan) =>
    autoStartedIds.has(plan.id)
      ? { ...plan, status: "started", startedAt: plan.startsAt }
      : plan,
  );

  const savedPostIds = userSaves.map((save) => save.postId);
  const savedPosts = savedPostIds.length
    ? await db.select().from(posts).where(inArray(posts.id, savedPostIds))
    : [];

  const publicProfiles = new Map(
    allProfiles.map((profile) => [
      profile.email,
      { displayName: profile.displayName, username: profile.username },
    ]),
  );

  const saved = userSaves.flatMap((save) => {
    const post = savedPosts.find((item) => item.id === save.postId);
    if (!post) return [];
    const author = publicProfiles.get(post.authorEmail);
    return [{
      id: save.id,
      postId: post.id,
      status: save.status,
      completedAt: save.completedAt,
      title: post.caption,
      activityType: post.activityType,
      location: post.location,
      durationMinutes: post.durationMinutes,
      imageUrl: `/api/media/${post.imageKey}`,
      authorName: author?.displayName || post.authorName,
      authorUsername: author?.username || "roavly.member",
    }];
  });

  const viewerPlanIds = new Set(
    allPlanMembers
      .filter(
        (member) =>
          member.userEmail === user.email &&
          ["requested", "invited", "accepted"].includes(member.status),
      )
      .map((member) => member.planId),
  );
  const plans = normalisedPlans
    .filter(
      (plan) =>
        plan.visibility === "public" ||
        plan.hostEmail === user.email ||
        viewerPlanIds.has(plan.id),
    )
    .map((plan) => {
    const host = publicProfiles.get(plan.hostEmail);
    const members = allPlanMembers
      .filter((member) => member.planId === plan.id)
      .map((member) => ({
        ...member,
        displayName: publicProfiles.get(member.userEmail)?.displayName || "Roavly member",
        username: publicProfiles.get(member.userEmail)?.username || "roavly.member",
        isViewer: member.userEmail === user.email,
      }));
    const viewerMembership = members.find((member) => member.isViewer);
    const journeyChat = journeyChats.find(
      (conversation) => conversation.adventurePlanId === plan.id,
    );
    const chatAvailable = Boolean(
      journeyChat &&
      (!journeyChat.expiresAt || journeyChat.expiresAt.getTime() > now.getTime()),
    );
    const canOpenChat =
      plan.hostEmail === user.email || viewerMembership?.status === "accepted";
    return {
      ...plan,
      hostName: host?.displayName || "Roavly host",
      hostUsername: host?.username || "roavly.member",
      isHost: plan.hostEmail === user.email,
      viewerStatus: plan.hostEmail === user.email ? "host" : viewerMembership?.status || "none",
      attendeeCount: members.filter((member) => member.status === "accepted").length,
      members: plan.hostEmail === user.email ? members : [],
      latitude: plan.hostEmail === user.email || viewerMembership?.status === "accepted" ? plan.latitude : null,
      longitude: plan.hostEmail === user.email || viewerMembership?.status === "accepted" ? plan.longitude : null,
      conversationId: chatAvailable && canOpenChat ? journeyChat?.id || null : null,
      chatExpiresAt: chatAvailable && canOpenChat ? journeyChat?.expiresAt || null : null,
    };
  });

  const communityClubs = allClubs.filter((club) => {
    const viewerMembership = allClubMembers.some(
      (member) =>
        member.clubId === club.id &&
        member.userEmail === user.email &&
        member.status === "active",
    );
    return club.visibility === "public" || club.ownerEmail === user.email || viewerMembership;
  }).map((club) => {
    const members = allClubMembers.filter((member) => member.clubId === club.id && member.status === "active");
    const owner = publicProfiles.get(club.ownerEmail);
    return {
      ...club,
      ownerName: owner?.displayName || "Roavly member",
      ownerUsername: owner?.username || "roavly.member",
      memberCount: members.length,
      viewerJoined: members.some((member) => member.userEmail === user.email),
      isOwner: club.ownerEmail === user.email,
    };
  });

  const outdoorMinutes = ownPosts.reduce((total, post) => total + post.durationMinutes, 0);
  const activityCount = new Set(ownPosts.map((post) => post.activityType)).size;
  const weekendCount = ownPosts.filter((post) => {
    const day = post.createdAt.getDay();
    return day === 0 || day === 6;
  }).length;
  const challengeValues = {
    minutes: outdoorMinutes,
    activities: activityCount,
    weekends: weekendCount,
    saves: userSaves.length,
  };
  const challenges = challengeDefinitions.map((challenge) => {
    const progress = challengeValues[challenge.metric];
    return { ...challenge, progress, complete: progress >= challenge.target };
  });

  return Response.json({
    saved,
    plans,
    clubs: communityClubs,
    safety: safetyRows[0] || {
      contactName: "",
      contactMethod: "",
      defaultCheckInMinutes: 120,
    },
    challenges,
    passport: {
      outdoorMinutes,
      journeyCount: ownPosts.length,
      activityCount,
      completedPlans: allPlanMembers.filter(
        (member) => member.userEmail === user.email && member.safeAt,
      ).length,
      completedChallenges: challenges.filter((challenge) => challenge.complete).length,
    },
  });
}
