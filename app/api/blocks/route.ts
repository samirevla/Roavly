import { getChatGPTUser } from "../../chatgpt-auth";
import { blockUserByUsername } from "../../blocks";
import { getDb } from "../../../db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to block a member." }, { status: 401 });

  const payload = (await request.json()) as { username?: string };
  const db = await getDb();
  const result = await blockUserByUsername(db, user.email, payload.username || "");
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ blocked: true, username: result.target.username });
}
