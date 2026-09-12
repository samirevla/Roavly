import { eq, lt } from "drizzle-orm";
import {
  createMobileSecret,
  getChatGPTUser,
  hashMobileSecret,
} from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { mobileAuthCodes } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    const url = new URL(request.url);
    return Response.redirect(
      new URL(
        `/login?return_to=${encodeURIComponent("/api/mobile/auth/complete")}`,
        url.origin,
      ),
      302,
    );
  }

  const code = createMobileSecret();
  const now = new Date();
  const db = await getDb();
  await db.delete(mobileAuthCodes).where(lt(mobileAuthCodes.expiresAt, now));
  await db.delete(mobileAuthCodes).where(eq(mobileAuthCodes.userEmail, user.email));
  await db.insert(mobileAuthCodes).values({
    codeHash: await hashMobileSecret(code),
    userEmail: user.email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  });

  const location = `roavly://auth?code=${encodeURIComponent(code)}`;
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
