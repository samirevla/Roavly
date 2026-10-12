import { getDb } from "../../../../../db";
import { tipReports } from "../../../../../db/schema";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { enforceRateLimit, RATE_LIMITS } from "../../../../rate-limit";
import { emitAnalytics } from "../../../../monetization";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to report unsafe information." }, { status: 401 });
  const limited = enforceRateLimit(`report:${user.email}`, RATE_LIMITS.report);
  if (limited) return limited;
  const { id } = await context.params;
  const payload = (await request.json()) as { reason?: string };
  const reason = String(payload.reason || "").trim().slice(0, 800);
  if (reason.length < 10) return Response.json({ error: "Tell the safety team what appears wrong or unsafe." }, { status: 400 });
  const db = await getDb();
  await db.insert(tipReports).values({ id: crypto.randomUUID(), tipId: id, reporterEmail: user.email, reason, status: "open", createdAt: new Date() })
    .onConflictDoUpdate({ target: [tipReports.tipId, tipReports.reporterEmail], set: { reason, status: "open", createdAt: new Date() } });
  await emitAnalytics({ eventName: "trail_tip_reported", userEmail: user.email, entityType: "trail_tip", entityId: id });
  return Response.json({ reported: true });
}
