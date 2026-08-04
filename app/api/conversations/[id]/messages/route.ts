import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import {
  chatMessages,
  conversationMembers,
  conversations,
  friendships,
  profiles,
} from "../../../../../db/schema";

export const dynamic = "force-dynamic";

async function membershipFor(conversationId: string, userEmail: string) {
  const db = await getDb();
  const [[membership], [conversation]] = await Promise.all([
    db
      .select()
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userEmail, userEmail),
        ),
      )
      .limit(1),
    db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1),
  ]);
  return { db, membership, conversation };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to read messages." }, { status: 401 });

  const { id } = await params;
  const { db, membership, conversation } = await membershipFor(id, user.email);
  if (!membership) {
    return Response.json({ error: "You are not a member of this conversation." }, { status: 403 });
  }
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.expiresAt && conversation.expiresAt.getTime() <= Date.now()) {
    return Response.json(
      { error: "This journey chat closed 48 hours after the journey ended." },
      { status: 410 },
    );
  }

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(200);
  const authorEmails = Array.from(new Set(rows.map((message) => message.authorEmail)));
  const authorProfiles = authorEmails.length
    ? await db.select().from(profiles)
    : [];
  const now = new Date();
  await db
    .update(conversationMembers)
    .set({ lastReadAt: now })
    .where(eq(conversationMembers.id, membership.id));

  return Response.json({
    messages: rows.reverse().map((message) => {
      const author = authorProfiles.find((profile) => profile.email === message.authorEmail);
      return {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        authorName: author?.displayName || "Roavly member",
        authorUsername: author?.username || "roavly.member",
        isMine: message.authorEmail === user.email,
      };
    }),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to send messages." }, { status: 401 });

  const { id } = await params;
  const { db, membership, conversation } = await membershipFor(id, user.email);
  if (!membership) {
    return Response.json({ error: "You are not a member of this conversation." }, { status: 403 });
  }
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.expiresAt && conversation.expiresAt.getTime() <= Date.now()) {
    return Response.json(
      { error: "This journey chat closed 48 hours after the journey ended." },
      { status: 410 },
    );
  }
  const payload = (await request.json()) as { body?: string };
  const body = payload.body?.trim() ?? "";
  if (!body || body.length > 1000) {
    return Response.json({ error: "Messages must be between 1 and 1,000 characters." }, { status: 400 });
  }

  if (conversation.type === "direct") {
    const members = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, id));
    const otherMember = members.find((member) => member.userEmail !== user.email);
    if (!otherMember) {
      return Response.json({ error: "This conversation is no longer available." }, { status: 409 });
    }
    const [friendship] = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          orPair(user.email, otherMember.userEmail),
        ),
      )
      .limit(1);
    if (!friendship) {
      return Response.json(
        { error: "You can only send direct messages to accepted friends." },
        { status: 403 },
      );
    }
  }

  const now = new Date();
  const idForMessage = crypto.randomUUID();
  await db.insert(chatMessages).values({
    id: idForMessage,
    conversationId: id,
    authorEmail: user.email,
    body,
    createdAt: now,
  });
  await Promise.all([
    db.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, id)),
    db
      .update(conversationMembers)
      .set({ lastReadAt: now })
      .where(eq(conversationMembers.id, membership.id)),
  ]);
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, user.email))
    .limit(1);

  return Response.json(
    {
      message: {
        id: idForMessage,
        body,
        createdAt: now,
        authorName: profile?.displayName || user.displayName,
        authorUsername: profile?.username || "roavly.member",
        isMine: true,
      },
    },
    { status: 201 },
  );
}

function orPair(first: string, second: string) {
  const [userOneEmail, userTwoEmail] = [first, second].sort((a, b) => a.localeCompare(b));
  return and(
    eq(friendships.userOneEmail, userOneEmail),
    eq(friendships.userTwoEmail, userTwoEmail),
  );
}
