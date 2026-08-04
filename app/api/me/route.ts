import { and, eq, ne } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

function cleanUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ user: null, profile: null });

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, user.email))
    .limit(1);

  if (existing) return Response.json({ user, profile: existing });

  const now = new Date();
  const usernameBase =
    cleanUsername(user.fullName || user.email.split("@")[0]) || "roavly.member";
  const [usernameTaken] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.username, usernameBase))
    .limit(1);
  const username = usernameTaken
    ? `${usernameBase.slice(0, 19)}.${crypto.randomUUID().slice(0, 4)}`
    : usernameBase;
  const [profile] = await db
    .insert(profiles)
    .values({
      email: user.email,
      displayName: user.fullName || user.displayName,
      username,
      bio: "",
      homeBase: "",
      favoriteActivities: "",
      ageBand: "Prefer not to say",
      experienceLevel: "All levels",
      pacePreference: "Flexible",
      availability: "Weekends",
      travelRadiusKm: 50,
      groupStyle: "Social",
      accessibilityNeeds: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return Response.json({ user, profile });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Sign in to update your profile." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    displayName?: string;
    username?: string;
    bio?: string;
    homeBase?: string;
    favoriteActivities?: string;
    ageBand?: string;
    experienceLevel?: string;
    pacePreference?: string;
    availability?: string;
    travelRadiusKm?: number;
    groupStyle?: string;
    accessibilityNeeds?: string;
  };
  const displayName = payload.displayName?.trim().slice(0, 60) || user.displayName;
  const username = cleanUsername(payload.username || "") || "roavly.member";
  const bio = payload.bio?.trim().slice(0, 180) || "";
  const homeBase = payload.homeBase?.trim().slice(0, 80) || "";
  const favoriteActivities =
    payload.favoriteActivities?.trim().slice(0, 120) || "";
  const ageBand = payload.ageBand === "18+" ? "18+" : payload.ageBand === "16–17" ? "16–17" : "Prefer not to say";
  const experienceLevel = payload.experienceLevel?.trim().slice(0, 40) || "All levels";
  const pacePreference = payload.pacePreference?.trim().slice(0, 40) || "Flexible";
  const availability = payload.availability?.trim().slice(0, 80) || "Weekends";
  const travelRadiusKm = Math.max(5, Math.min(500, Number(payload.travelRadiusKm) || 50));
  const groupStyle = payload.groupStyle?.trim().slice(0, 50) || "Social";
  const accessibilityNeeds = payload.accessibilityNeeds?.trim().slice(0, 240) || "";

  const db = await getDb();
  const [usernameOwner] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(and(eq(profiles.username, username), ne(profiles.email, user.email)))
    .limit(1);
  if (usernameOwner) {
    return Response.json({ error: "That username is already taken." }, { status: 409 });
  }
  const now = new Date();
  const [profile] = await db
    .insert(profiles)
    .values({
      email: user.email,
      displayName,
      username,
      bio,
      homeBase,
      favoriteActivities,
      ageBand,
      experienceLevel,
      pacePreference,
      availability,
      travelRadiusKm,
      groupStyle,
      accessibilityNeeds,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.email,
      set: {
        displayName,
        username,
        bio,
        homeBase,
        favoriteActivities,
        ageBand,
        experienceLevel,
        pacePreference,
        availability,
        travelRadiusKm,
        groupStyle,
        accessibilityNeeds,
        updatedAt: now,
      },
    })
    .returning();

  return Response.json({ profile });
}
