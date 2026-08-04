import { eq } from "drizzle-orm";
import {
  bearerToken,
  hashMobileSecret,
} from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { mobileAuthSessions } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (token) {
    const db = await getDb();
    await db
      .delete(mobileAuthSessions)
      .where(eq(mobileAuthSessions.tokenHash, await hashMobileSecret(token)));
  }
  return Response.json({ signedOut: true });
}
