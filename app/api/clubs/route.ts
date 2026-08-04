import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { clubMembers, clubs } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to create a club." }, { status: 401 });
  const payload = (await request.json()) as {
    name?: string;
    description?: string;
    activityType?: string;
    homeBase?: string;
    visibility?: "public" | "private";
  };
  const name = payload.name?.trim().slice(0, 60) || "";
  if (name.length < 3) return Response.json({ error: "Club names need at least 3 characters." }, { status: 400 });

  const now = new Date();
  const id = crypto.randomUUID();
  const db = await getDb();
  const [club] = await db
    .insert(clubs)
    .values({
      id,
      ownerEmail: user.email,
      name,
      description: payload.description?.trim().slice(0, 240) || "",
      activityType: payload.activityType?.trim().slice(0, 50) || "All outdoor activities",
      homeBase: payload.homeBase?.trim().slice(0, 100) || "",
      visibility: payload.visibility === "private" ? "private" : "public",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await db.insert(clubMembers).values({
    id: crypto.randomUUID(),
    clubId: id,
    userEmail: user.email,
    role: "owner",
    status: "active",
    joinedAt: now,
  });
  return Response.json({ club }, { status: 201 });
}
