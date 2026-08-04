import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import {
  adventurePlans,
  conversationMembers,
  conversations,
  friendships,
  planMembers,
  profiles,
} from "../../../../db/schema";

export const dynamic = "force-dynamic";

const CHAT_AFTER_COMPLETION_MS = 48 * 60 * 60 * 1000;

type PlanAction =
  | "request"
  | "accept"
  | "decline"
  | "invite"
  | "accept_invite"
  | "decline_invite"
  | "start"
  | "complete"
  | "create_chat"
  | "checkin"
  | "safe"
  | "cancel";

type Db = Awaited<ReturnType<typeof getDb>>;

function hasStarted(
  plan: typeof adventurePlans.$inferSelect,
  now: Date,
) {
  return (
    plan.status === "started" ||
    Boolean(plan.startedAt) ||
    plan.startsAt.getTime() <= now.getTime()
  );
}

async function markAutomaticallyStarted(
  db: Db,
  plan: typeof adventurePlans.$inferSelect,
  now: Date,
) {
  if (
    (plan.status === "open" || plan.status === "scheduled") &&
    plan.startsAt.getTime() <= now.getTime()
  ) {
    await db
      .update(adventurePlans)
      .set({ status: "started", startedAt: plan.startsAt, updatedAt: now })
      .where(eq(adventurePlans.id, plan.id));
    return true;
  }
  return hasStarted(plan, now);
}

async function addMemberToJourneyChat(
  db: Db,
  planId: string,
  userEmail: string,
  now: Date,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.adventurePlanId, planId))
    .limit(1);
  if (!conversation || (conversation.expiresAt && conversation.expiresAt <= now)) return;
  await db
    .insert(conversationMembers)
    .values({
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      userEmail,
      joinedAt: now,
      lastReadAt: now,
    })
    .onConflictDoNothing();
}

async function acceptedFriend(
  db: Db,
  firstEmail: string,
  secondEmail: string,
) {
  const [userOneEmail, userTwoEmail] = [firstEmail, secondEmail].sort((a, b) =>
    a.localeCompare(b),
  );
  const [friendship] = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.userOneEmail, userOneEmail),
        eq(friendships.userTwoEmail, userTwoEmail),
        eq(friendships.status, "accepted"),
      ),
    )
    .limit(1);
  return Boolean(friendship);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to update this adventure." }, { status: 401 });
  const { id } = await context.params;
  const payload = (await request.json()) as { action?: PlanAction; username?: string };
  if (!payload.action) return Response.json({ error: "Choose an action." }, { status: 400 });

  const db = await getDb();
  const [plan] = await db.select().from(adventurePlans).where(eq(adventurePlans.id, id)).limit(1);
  if (!plan) return Response.json({ error: "Adventure plan not found." }, { status: 404 });

  const now = new Date();
  const isHost = plan.hostEmail === user.email;
  const terminal = plan.status === "cancelled" || plan.status === "completed";

  if (payload.action === "cancel") {
    if (!isHost) return Response.json({ error: "Only the host can cancel this plan." }, { status: 403 });
    if (plan.status === "completed") {
      return Response.json({ error: "A completed journey cannot be cancelled." }, { status: 409 });
    }
    await db
      .update(adventurePlans)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(adventurePlans.id, id));
    await db
      .update(conversations)
      .set({ expiresAt: now, updatedAt: now })
      .where(eq(conversations.adventurePlanId, id));
    return Response.json({ status: "cancelled" });
  }

  if (terminal) {
    return Response.json({ error: `This journey is already ${plan.status}.` }, { status: 409 });
  }

  const started = await markAutomaticallyStarted(db, plan, now);

  if (payload.action === "start") {
    if (!isHost) return Response.json({ error: "Only the host can start this journey early." }, { status: 403 });
    if (!started) {
      await db
        .update(adventurePlans)
        .set({ status: "started", startedAt: now, updatedAt: now })
        .where(eq(adventurePlans.id, id));
    }
    return Response.json({ status: "started", startedAt: started ? plan.startedAt ?? plan.startsAt : now });
  }

  if (payload.action === "complete") {
    if (!isHost) return Response.json({ error: "Only the host can complete this journey." }, { status: 403 });
    if (!started) {
      return Response.json({ error: "Start the journey before marking it complete." }, { status: 409 });
    }
    const expiresAt = new Date(now.getTime() + CHAT_AFTER_COMPLETION_MS);
    await db
      .update(adventurePlans)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(adventurePlans.id, id));
    await db
      .update(conversations)
      .set({ expiresAt, updatedAt: now })
      .where(eq(conversations.adventurePlanId, id));
    return Response.json({ status: "completed", completedAt: now, chatExpiresAt: expiresAt });
  }

  if (payload.action === "create_chat") {
    if (!isHost) return Response.json({ error: "Only the host can create the journey chat." }, { status: 403 });
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.adventurePlanId, id))
      .limit(1);
    if (existing) return Response.json({ status: "ready", conversationId: existing.id });

    const acceptedMembers = await db
      .select()
      .from(planMembers)
      .where(and(eq(planMembers.planId, id), eq(planMembers.status, "accepted")));
    const memberEmails = Array.from(
      new Set([plan.hostEmail, ...acceptedMembers.map((member) => member.userEmail)]),
    );
    const conversationId = crypto.randomUUID();
    try {
      await db.insert(conversations).values({
        id: conversationId,
        type: "group",
        name: plan.title,
        purpose: "journey",
        activityType: plan.activityType,
        startsAt: plan.startsAt,
        location: plan.location,
        planNotes: [
          plan.equipment ? `Packing: ${plan.equipment}` : "",
          plan.safetyNotes ? `Safety: ${plan.safetyNotes}` : "",
        ].filter(Boolean).join("\n"),
        adventurePlanId: id,
        directKey: null,
        createdByEmail: user.email,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(conversationMembers).values(
        memberEmails.map((email) => ({
          id: crypto.randomUUID(),
          conversationId,
          userEmail: email,
          joinedAt: now,
          lastReadAt: now,
        })),
      );
      return Response.json({ status: "created", conversationId }, { status: 201 });
    } catch (error) {
      const [raced] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.adventurePlanId, id))
        .limit(1);
      if (raced) return Response.json({ status: "ready", conversationId: raced.id });
      throw error;
    }
  }

  if (payload.action === "invite") {
    if (!isHost) return Response.json({ error: "Only the host can invite friends." }, { status: 403 });
    if (started) {
      return Response.json({ error: "Friend invitations close once the journey starts." }, { status: 409 });
    }
    const username = payload.username?.trim().toLowerCase();
    if (!username) return Response.json({ error: "Choose a friend to invite." }, { status: 400 });
    const [friendProfile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
    if (!friendProfile || friendProfile.email === user.email) {
      return Response.json({ error: "That friend could not be found." }, { status: 404 });
    }
    if (!(await acceptedFriend(db, user.email, friendProfile.email))) {
      return Response.json({ error: "You can only invite accepted friends." }, { status: 403 });
    }
    const members = await db.select().from(planMembers).where(eq(planMembers.planId, id));
    const existing = members.find((member) => member.userEmail === friendProfile.email);
    if (existing?.status === "accepted" || existing?.status === "invited") {
      return Response.json({ status: existing.status });
    }
    if (existing?.status === "requested") {
      return Response.json(
        { error: "This friend already asked to join. Accept their request instead." },
        { status: 409 },
      );
    }
    const reservedCount = members.filter((member) =>
      member.status === "accepted" || member.status === "invited"
    ).length;
    if (reservedCount >= plan.capacity) {
      return Response.json({ error: "This journey has reached capacity." }, { status: 409 });
    }
    if (existing) {
      await db
        .update(planMembers)
        .set({ status: "invited", requestedAt: now, updatedAt: now })
        .where(eq(planMembers.id, existing.id));
    } else {
      await db.insert(planMembers).values({
        id: crypto.randomUUID(),
        planId: id,
        userEmail: friendProfile.email,
        status: "invited",
        requestedAt: now,
        updatedAt: now,
      });
    }
    return Response.json({ status: "invited" }, { status: 201 });
  }

  if (payload.action === "accept" || payload.action === "decline") {
    if (!isHost) {
      return Response.json({ error: "Only the host can manage join requests." }, { status: 403 });
    }
    if (started) {
      return Response.json({ error: "Join requests close once the journey starts." }, { status: 409 });
    }
    const username = payload.username?.trim().toLowerCase();
    if (!username) return Response.json({ error: "Choose a member." }, { status: 400 });
    const [memberProfile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
    if (!memberProfile) return Response.json({ error: "Member not found." }, { status: 404 });
    const [requestedMembership] = await db
      .select()
      .from(planMembers)
      .where(
        and(
          eq(planMembers.planId, id),
          eq(planMembers.userEmail, memberProfile.email),
          eq(planMembers.status, "requested"),
        ),
      )
      .limit(1);
    if (!requestedMembership) {
      return Response.json({ error: "That join request is no longer pending." }, { status: 409 });
    }
    const nextStatus = payload.action === "accept" ? "accepted" : "declined";
    await db
      .update(planMembers)
      .set({ status: nextStatus, updatedAt: now })
      .where(eq(planMembers.id, requestedMembership.id));
    if (nextStatus === "accepted") {
      await addMemberToJourneyChat(db, id, memberProfile.email, now);
    }
    return Response.json({ status: nextStatus });
  }

  const [membership] = await db
    .select()
    .from(planMembers)
    .where(and(eq(planMembers.planId, id), eq(planMembers.userEmail, user.email)))
    .limit(1);

  if (payload.action === "accept_invite" || payload.action === "decline_invite") {
    if (!membership || membership.status !== "invited") {
      return Response.json({ error: "This invitation is no longer available." }, { status: 409 });
    }
    if (started) {
      return Response.json({ error: "This invitation closed when the journey started." }, { status: 409 });
    }
    if (payload.action === "decline_invite") {
      await db.delete(planMembers).where(eq(planMembers.id, membership.id));
      return Response.json({ status: "declined" });
    }
    await db
      .update(planMembers)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(planMembers.id, membership.id));
    await addMemberToJourneyChat(db, id, user.email, now);
    return Response.json({ status: "accepted" });
  }

  if (payload.action === "request") {
    if (started) return Response.json({ error: "This journey has already started." }, { status: 409 });
    if (plan.status !== "open" && plan.status !== "scheduled") {
      return Response.json({ error: "This adventure is not open." }, { status: 409 });
    }
    if (membership) return Response.json({ status: membership.status });
    const members = await db.select().from(planMembers).where(eq(planMembers.planId, id));
    const acceptedCount = members.filter((member) => member.status === "accepted").length;
    if (acceptedCount >= plan.capacity) {
      return Response.json({ error: "This adventure has reached capacity." }, { status: 409 });
    }
    await db.insert(planMembers).values({
      id: crypto.randomUUID(),
      planId: id,
      userEmail: user.email,
      status: "requested",
      requestedAt: now,
      updatedAt: now,
    });
    return Response.json({ status: "requested" }, { status: 201 });
  }

  if (!membership || membership.status !== "accepted") {
    return Response.json({ error: "Only accepted participants can use safety check-ins." }, { status: 403 });
  }
  if (!started) {
    return Response.json(
      { error: "Safety check-ins become available when the journey starts." },
      { status: 409 },
    );
  }
  if (payload.action === "checkin") {
    await db
      .update(planMembers)
      .set({ checkedInAt: now, safeAt: null, updatedAt: now })
      .where(eq(planMembers.id, membership.id));
    return Response.json({ status: "checked-in" });
  }
  if (payload.action === "safe") {
    await db
      .update(planMembers)
      .set({ safeAt: now, updatedAt: now })
      .where(eq(planMembers.id, membership.id));
    return Response.json({ status: "safe" });
  }

  return Response.json({ error: "That journey action is not supported." }, { status: 400 });
}
