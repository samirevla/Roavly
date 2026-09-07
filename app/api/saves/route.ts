import { and, count, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { posts, savedJourneys } from "../../../db/schema";
import { getMonetizationConfig, hasFeature } from "../../monetization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to save an adventure." }, { status: 401 });

  const payload = (await request.json()) as {
    postId?: string;
    action?: "toggle" | "complete" | "plan";
  };
  const postId = payload.postId?.trim();
  if (!postId || !payload.action) {
    return Response.json({ error: "Choose a journey and an action." }, { status: 400 });
  }

  const db = await getDb();
  const [post] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return Response.json({ error: "That journey no longer exists." }, { status: 404 });

  const [existing] = await db
    .select()
    .from(savedJourneys)
    .where(and(eq(savedJourneys.postId, postId), eq(savedJourneys.userEmail, user.email)))
    .limit(1);

  if (payload.action === "toggle") {
    if (existing) {
      await db.delete(savedJourneys).where(eq(savedJourneys.id, existing.id));
      return Response.json({ saved: false, status: "none" });
    }
    if (!(await hasFeature(user.email, "unlimited_saved_trips"))) {
      const config = await getMonetizationConfig();
      const [savedCount] = await db.select({ value: count() }).from(savedJourneys).where(eq(savedJourneys.userEmail, user.email));
      if ((savedCount?.value || 0) >= config.freeSavedTripsLimit) {
        return Response.json({
          error: `Free accounts can save up to ${config.freeSavedTripsLimit} adventures. Waymark+ removes the limit.`,
          code: "SAVE_LIMIT_REACHED",
        }, { status: 402 });
      }
    }
    await db.insert(savedJourneys).values({
      id: crypto.randomUUID(),
      postId,
      userEmail: user.email,
      status: "saved",
      createdAt: new Date(),
      completedAt: null,
    });
    return Response.json({ saved: true, status: "saved" }, { status: 201 });
  }

  const now = new Date();
  const nextStatus = payload.action === "complete" ? "completed" : "planned";
  if (existing) {
    await db
      .update(savedJourneys)
      .set({ status: nextStatus, completedAt: payload.action === "complete" ? now : null })
      .where(eq(savedJourneys.id, existing.id));
  } else {
    await db.insert(savedJourneys).values({
      id: crypto.randomUUID(),
      postId,
      userEmail: user.email,
      status: nextStatus,
      createdAt: now,
      completedAt: payload.action === "complete" ? now : null,
    });
  }
  return Response.json({ saved: true, status: nextStatus });
}
