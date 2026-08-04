import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { safetyProfiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to update your safety circle." }, { status: 401 });
  const payload = (await request.json()) as {
    contactName?: string;
    contactMethod?: string;
    defaultCheckInMinutes?: number;
  };
  const contactName = payload.contactName?.trim().slice(0, 80) || "";
  const contactMethod = payload.contactMethod?.trim().slice(0, 120) || "";
  const defaultCheckInMinutes = Math.max(30, Math.min(1440, Number(payload.defaultCheckInMinutes) || 120));
  const now = new Date();
  const db = await getDb();
  const [safety] = await db
    .insert(safetyProfiles)
    .values({ userEmail: user.email, contactName, contactMethod, defaultCheckInMinutes, updatedAt: now })
    .onConflictDoUpdate({
      target: safetyProfiles.userEmail,
      set: { contactName, contactMethod, defaultCheckInMinutes, updatedAt: now },
    })
    .returning();
  return Response.json({ safety });
}
