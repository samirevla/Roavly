import { and, eq, gt } from "drizzle-orm";
import {
  createMobileSecret,
  hashMobileSecret,
} from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import {
  mobileAuthCodes,
  mobileAuthSessions,
  profiles,
} from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { code?: string };
  const code = payload.code?.trim() || "";
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(code)) {
    return Response.json({ error: "This sign-in link is invalid." }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date();
  const codeHash = await hashMobileSecret(code);
  const consumed = await db
    .delete(mobileAuthCodes)
    .where(
      and(
        eq(mobileAuthCodes.codeHash, codeHash),
        gt(mobileAuthCodes.expiresAt, now),
      ),
    )
    .returning();
  const authCode = consumed[0];
  if (!authCode) {
    return Response.json(
      { error: "This sign-in link has expired or was already used." },
      { status: 401 },
    );
  }

  const token = createMobileSecret(48);
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(mobileAuthSessions).values({
    id: crypto.randomUUID(),
    tokenHash: await hashMobileSecret(token),
    userEmail: authCode.userEmail,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
  });
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, authCode.userEmail))
    .limit(1);

  return Response.json(
    {
      token,
      expiresAt,
      user: {
        email: authCode.userEmail,
        displayName: profile?.displayName || authCode.userEmail,
        fullName: profile?.displayName || null,
      },
      profile: profile ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
