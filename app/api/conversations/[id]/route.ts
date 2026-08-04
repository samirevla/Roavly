import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { conversationMembers, conversations } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to update this journey." }, { status: 401 });

  const { id } = await params;
  const payload = (await request.json()) as {
    name?: string;
    activityType?: string;
    startsAt?: string;
    location?: string;
    planNotes?: string;
  };
  const db = await getDb();
  const [[conversation], [membership]] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.id, id)).limit(1),
    db
      .select()
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, id),
          eq(conversationMembers.userEmail, user.email),
        ),
      )
      .limit(1),
  ]);
  if (!conversation || conversation.type !== "group" || conversation.purpose !== "journey") {
    return Response.json({ error: "Journey Together chat not found." }, { status: 404 });
  }
  if (!membership) {
    return Response.json({ error: "Only group members can update this journey plan." }, { status: 403 });
  }
  if (conversation.expiresAt) {
    return Response.json(
      { error: "Completed journey plans are read-only while their chat winds down." },
      { status: 409 },
    );
  }
  if (conversation.adventurePlanId) {
    return Response.json(
      { error: "Update this scheduled journey from the Journeys screen." },
      { status: 409 },
    );
  }

  const name = payload.name?.trim().slice(0, 60) || "";
  const activityType = payload.activityType?.trim().slice(0, 50) || "";
  const location = payload.location?.trim().slice(0, 160) || "";
  const planNotes = payload.planNotes?.trim().slice(0, 500) || "";
  const startsAt = new Date(payload.startsAt || "");
  if (
    name.length < 2 ||
    !activityType ||
    !location ||
    Number.isNaN(startsAt.getTime()) ||
    startsAt.getTime() < Date.now() - 60000
  ) {
    return Response.json(
      { error: "Keep a name, activity, future date and meeting area in the plan." },
      { status: 400 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(conversations)
    .set({ name, activityType, startsAt, location, planNotes, updatedAt: now })
    .where(eq(conversations.id, id))
    .returning();
  return Response.json({
    journey: {
      name: updated.name,
      activityType: updated.activityType,
      startsAt: updated.startsAt,
      location: updated.location,
      planNotes: updated.planNotes,
      updatedAt: updated.updatedAt,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to leave groups." }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conversation || conversation.type !== "group") {
    return Response.json({ error: "Only group conversations can be left." }, { status: 400 });
  }

  const removed = await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userEmail, user.email),
      ),
    )
    .returning();
  if (!removed.length) {
    return Response.json({ error: "You are not a member of this group." }, { status: 404 });
  }
  return Response.json({ left: true });
}
