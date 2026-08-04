import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { clubMembers, clubs } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to join a club." }, { status: 401 });
  const { id } = await context.params;
  const payload = (await request.json()) as { action?: "join" | "leave" };
  const db = await getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, id)).limit(1);
  if (!club) return Response.json({ error: "Club not found." }, { status: 404 });
  const [membership] = await db
    .select()
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, id), eq(clubMembers.userEmail, user.email)))
    .limit(1);

  if (payload.action === "leave") {
    if (club.ownerEmail === user.email) {
      return Response.json({ error: "A club owner cannot leave their own club." }, { status: 409 });
    }
    if (membership) await db.delete(clubMembers).where(eq(clubMembers.id, membership.id));
    return Response.json({ joined: false });
  }

  if (membership) return Response.json({ joined: true });
  await db.insert(clubMembers).values({
    id: crypto.randomUUID(),
    clubId: id,
    userEmail: user.email,
    role: "member",
    status: "active",
    joinedAt: new Date(),
  });
  return Response.json({ joined: true }, { status: 201 });
}
