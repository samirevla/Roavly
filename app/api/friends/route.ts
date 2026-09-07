import { and, eq, or } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { blocks, friendships, profiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

function orderedPair(first: string, second: string) {
  return first.localeCompare(second) < 0 ? [first, second] : [second, first];
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to find friends." }, { status: 401 });

  const db = await getDb();
  const [allProfiles, relationships, allBlocks] = await Promise.all([
    db.select().from(profiles),
    db
      .select()
      .from(friendships)
      .where(
        or(
          eq(friendships.userOneEmail, user.email),
          eq(friendships.userTwoEmail, user.email),
        ),
      ),
    db
      .select()
      .from(blocks)
      .where(
        or(
          eq(blocks.blockerEmail, user.email),
          eq(blocks.blockedEmail, user.email),
        ),
      ),
  ]);

  const people = allProfiles
    .filter(
      (profile) =>
        profile.email !== user.email &&
        !allBlocks.some(
          (block) =>
            block.blockerEmail === profile.email || block.blockedEmail === profile.email,
        ),
    )
    .map((profile) => {
      const relationship = relationships.find(
        (item) =>
          item.userOneEmail === profile.email || item.userTwoEmail === profile.email,
      );
      let state: "none" | "outgoing" | "incoming" | "friends" = "none";
      if (relationship?.status === "accepted") state = "friends";
      else if (relationship?.requestedByEmail === user.email) state = "outgoing";
      else if (relationship) state = "incoming";
      return {
        displayName: profile.displayName,
        username: profile.username,
        bio: profile.bio,
        homeBase: profile.homeBase,
        favoriteActivities: profile.favoriteActivities,
        experienceLevel: profile.experienceLevel,
        pacePreference: profile.pacePreference,
        availability: profile.availability,
        travelRadiusKm: profile.travelRadiusKm,
        groupStyle: profile.groupStyle,
        accessibilityNeeds: profile.accessibilityNeeds,
        relationship: state,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return Response.json({ people });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to manage friends." }, { status: 401 });

  const payload = (await request.json()) as {
    action?: "request" | "accept" | "decline" | "remove" | "block";
    targetUsername?: string;
  };
  const targetUsername = payload.targetUsername?.trim().toLowerCase();
  if (!payload.action || !targetUsername) {
    return Response.json({ error: "Choose a member and an action." }, { status: 400 });
  }

  const db = await getDb();
  const [target] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.username, targetUsername))
    .limit(1);
  if (!target || target.email === user.email) {
    return Response.json({ error: "That Waymark member was not found." }, { status: 404 });
  }

  const [userOneEmail, userTwoEmail] = orderedPair(user.email, target.email);
  const [existing] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.userOneEmail, userOneEmail),
        eq(friendships.userTwoEmail, userTwoEmail),
      ),
    )
    .limit(1);
  const now = new Date();

  if (payload.action === "block") {
    if (existing) await db.delete(friendships).where(eq(friendships.id, existing.id));
    await db
      .insert(blocks)
      .values({
        id: crypto.randomUUID(),
        blockerEmail: user.email,
        blockedEmail: target.email,
        createdAt: now,
      })
      .onConflictDoNothing();
    return Response.json({ relationship: "none", blocked: true });
  }

  if (payload.action === "request") {
    if (existing?.status === "accepted") {
      return Response.json({ relationship: "friends" });
    }
    if (existing && existing.requestedByEmail !== user.email) {
      await db
        .update(friendships)
        .set({ status: "accepted", updatedAt: now })
        .where(eq(friendships.id, existing.id));
      return Response.json({ relationship: "friends" });
    }
    if (existing) return Response.json({ relationship: "outgoing" });
    await db.insert(friendships).values({
      id: crypto.randomUUID(),
      userOneEmail,
      userTwoEmail,
      requestedByEmail: user.email,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return Response.json({ relationship: "outgoing" }, { status: 201 });
  }

  if (!existing) {
    return Response.json({ error: "Friend request not found." }, { status: 404 });
  }
  if (payload.action === "accept") {
    if (existing.requestedByEmail === user.email) {
      return Response.json({ error: "Only the recipient can accept this request." }, { status: 403 });
    }
    await db
      .update(friendships)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(friendships.id, existing.id));
    return Response.json({ relationship: "friends" });
  }

  await db.delete(friendships).where(eq(friendships.id, existing.id));
  return Response.json({ relationship: "none" });
}
