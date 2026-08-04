import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import {
  chatMessages,
  blocks,
  conversationMembers,
  conversations,
  friendships,
  profiles,
} from "../../../db/schema";

export const dynamic = "force-dynamic";

function directKey(first: string, second: string) {
  return [first, second].sort((a, b) => a.localeCompare(b)).join("::");
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to view messages." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const viewerMemberships = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.userEmail, user.email));
    const conversationIds = viewerMemberships.map((membership) => membership.conversationId);
    if (!conversationIds.length) return Response.json({ conversations: [], unreadTotal: 0 });

    const [conversationRows, memberRows, messageRows, profileRows, blockRows] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(inArray(conversations.id, conversationIds))
        .orderBy(desc(conversations.updatedAt)),
      db
        .select()
        .from(conversationMembers)
        .where(inArray(conversationMembers.conversationId, conversationIds)),
      db
        .select()
        .from(chatMessages)
        .where(inArray(chatMessages.conversationId, conversationIds))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1000),
      db.select().from(profiles),
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
    const blockedEmails = new Set(
      blockRows.flatMap((block) => [block.blockerEmail, block.blockedEmail]),
    );
    blockedEmails.delete(user.email);

    const now = Date.now();
    const summaries = conversationRows.flatMap((conversation) => {
      if (conversation.expiresAt && conversation.expiresAt.getTime() <= now) {
        return [];
      }
      const membership = viewerMemberships.find(
        (item) => item.conversationId === conversation.id,
      );
      const conversationMessages = messageRows.filter(
        (message) => message.conversationId === conversation.id,
      );
      const conversationMemberRows = memberRows.filter(
        (item) => item.conversationId === conversation.id,
      );
      if (
        conversation.type === "direct" &&
        conversationMemberRows.some(
          (member) => member.userEmail !== user.email && blockedEmails.has(member.userEmail),
        )
      ) {
        return [];
      }
      const members = conversationMemberRows
        .map((item) => {
          const profile = profileRows.find((candidate) => candidate.email === item.userEmail);
          return {
            displayName: profile?.displayName || "Roavly member",
            username: profile?.username || "roavly.member",
            isViewer: item.userEmail === user.email,
          };
        });
      const otherMembers = members.filter((member) => !member.isViewer);
      const lastMessage = conversationMessages[0];
      const lastReadAt = membership?.lastReadAt.getTime() ?? 0;
      const unreadCount = conversationMessages.filter(
        (message) =>
          message.authorEmail !== user.email &&
          message.createdAt.getTime() > lastReadAt,
      ).length;
      const directMember = otherMembers[0];

      return [{
        id: conversation.id,
        type: conversation.type,
        purpose: conversation.purpose,
        name:
          conversation.type === "group"
            ? conversation.name
            : directMember?.displayName || "Direct message",
        username: conversation.type === "direct" ? directMember?.username || "" : "",
        activityType: conversation.activityType,
        startsAt: conversation.startsAt,
        location: conversation.location,
        planNotes: conversation.planNotes,
        adventurePlanId: conversation.adventurePlanId,
        expiresAt: conversation.expiresAt,
        isCreator: conversation.createdByEmail === user.email,
        members,
        updatedAt: conversation.updatedAt,
        unreadCount,
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              createdAt: lastMessage.createdAt,
              isMine: lastMessage.authorEmail === user.email,
            }
          : null,
      }];
    });

    return Response.json({
      conversations: summaries,
      unreadTotal: summaries.reduce((total, item) => total + item.unreadCount, 0),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Messages could not load.";
    if (message.includes("no such table")) {
      return Response.json({ conversations: [], unreadTotal: 0 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to start a conversation." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    type?: "direct" | "group";
    purpose?: "chat" | "journey";
    name?: string;
    memberUsernames?: string[];
    activityType?: string;
    startsAt?: string;
    location?: string;
    planNotes?: string;
  };
  const type = payload.type;
  const usernames = Array.from(
    new Set(
      (payload.memberUsernames ?? [])
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const name = payload.name?.trim() ?? "";
  const purpose = type === "group" && payload.purpose === "journey" ? "journey" : "chat";
  const activityType = purpose === "journey" ? payload.activityType?.trim().slice(0, 50) || "" : "";
  const location = purpose === "journey" ? payload.location?.trim().slice(0, 160) || "" : "";
  const planNotes = purpose === "journey" ? payload.planNotes?.trim().slice(0, 500) || "" : "";
  const startsAt = purpose === "journey" ? new Date(payload.startsAt || "") : null;

  if (type !== "direct" && type !== "group") {
    return Response.json({ error: "Choose a direct or group conversation." }, { status: 400 });
  }
  if (type === "direct" && usernames.length !== 1) {
    return Response.json({ error: "Choose one friend to message." }, { status: 400 });
  }
  if (type === "group" && (name.length < 2 || name.length > 60)) {
    return Response.json({ error: "Group names must be between 2 and 60 characters." }, { status: 400 });
  }
  if (type === "group" && (usernames.length < 1 || usernames.length > 19)) {
    return Response.json({ error: "Choose between 1 and 19 friends for the group." }, { status: 400 });
  }
  if (
    purpose === "journey" &&
    (
      !activityType ||
      !location ||
      !startsAt ||
      Number.isNaN(startsAt.getTime()) ||
      startsAt.getTime() < Date.now() - 60000
    )
  ) {
    return Response.json(
      { error: "Add an activity, future date and meeting area for your Journey Together chat." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const targetProfiles = await db
    .select()
    .from(profiles)
    .where(inArray(profiles.username, usernames));
  if (targetProfiles.length !== usernames.length || targetProfiles.some((item) => item.email === user.email)) {
    return Response.json({ error: "One or more selected friends could not be found." }, { status: 404 });
  }

  const acceptedFriendships = await db
    .select()
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          eq(friendships.userOneEmail, user.email),
          eq(friendships.userTwoEmail, user.email),
        ),
      ),
    );
  const friendEmails = new Set(
    acceptedFriendships.map((friendship) =>
      friendship.userOneEmail === user.email
        ? friendship.userTwoEmail
        : friendship.userOneEmail,
    ),
  );
  if (targetProfiles.some((profile) => !friendEmails.has(profile.email))) {
    return Response.json(
      { error: "You can only start conversations with accepted friends." },
      { status: 403 },
    );
  }

  if (type === "direct") {
    const key = directKey(user.email, targetProfiles[0].email);
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.directKey, key))
      .limit(1);
    if (existing) return Response.json({ conversationId: existing.id });
  }

  const now = new Date();
  const conversationId = crypto.randomUUID();
  const keyForDirect = type === "direct" ? directKey(user.email, targetProfiles[0].email) : null;
  try {
    await db.insert(conversations).values({
      id: conversationId,
      type,
      name: type === "group" ? name : "",
      purpose,
      activityType,
      startsAt,
      location,
      planNotes,
      directKey: keyForDirect,
      createdByEmail: user.email,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (keyForDirect) {
      const [racedConversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.directKey, keyForDirect))
        .limit(1);
      if (racedConversation) {
        return Response.json({ conversationId: racedConversation.id });
      }
    }
    throw error;
  }
  try {
    await db.insert(conversationMembers).values(
      [user.email, ...targetProfiles.map((profile) => profile.email)].map((email) => ({
        id: crypto.randomUUID(),
        conversationId,
        userEmail: email,
        joinedAt: now,
        lastReadAt: now,
      })),
    );
  } catch (error) {
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    throw error;
  }

  return Response.json({ conversationId }, { status: 201 });
}
