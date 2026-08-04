import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { adventurePlans, planMembers } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to plan an adventure." }, { status: 401 });

  const payload = (await request.json()) as {
    sourcePostId?: string;
    title?: string;
    activityType?: string;
    startsAt?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    experienceLevel?: string;
    pace?: string;
    equipment?: string;
    capacity?: number;
    visibility?: "public" | "friends";
    safetyNotes?: string;
  };
  const title = payload.title?.trim().slice(0, 80) || "";
  const location = payload.location?.trim().slice(0, 160) || "";
  const startsAt = new Date(payload.startsAt || "");
  if (!title || !location || Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() - 60000) {
    return Response.json({ error: "Add a title, future date and meeting area." }, { status: 400 });
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const db = await getDb();
  const [plan] = await db
    .insert(adventurePlans)
    .values({
      id,
      hostEmail: user.email,
      sourcePostId: payload.sourcePostId?.trim() || null,
      title,
      activityType: payload.activityType?.trim().slice(0, 50) || "Outdoor adventure",
      startsAt,
      location,
      latitude: Number.isFinite(payload.latitude) ? Number(payload.latitude) : null,
      longitude: Number.isFinite(payload.longitude) ? Number(payload.longitude) : null,
      experienceLevel: payload.experienceLevel?.trim().slice(0, 40) || "All levels",
      pace: payload.pace?.trim().slice(0, 40) || "Flexible",
      equipment: payload.equipment?.trim().slice(0, 240) || "",
      capacity: Math.max(2, Math.min(50, Number(payload.capacity) || 8)),
      visibility: payload.visibility === "friends" ? "friends" : "public",
      status: "scheduled",
      safetyNotes: payload.safetyNotes?.trim().slice(0, 300) || "",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(planMembers).values({
    id: crypto.randomUUID(),
    planId: id,
    userEmail: user.email,
    status: "accepted",
    requestedAt: now,
    updatedAt: now,
  });

  return Response.json({ plan }, { status: 201 });
}
