import { and, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { CURATED_GEAR_CATALOG } from "../../gear-catalog";
import { getDb } from "../../../db";
import { gearProductReviews, profiles } from "../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(gearProductReviews)
    .orderBy(desc(gearProductReviews.createdAt))
    .limit(200);
  const emails = Array.from(new Set(rows.map((row) => row.userEmail)));
  const allProfiles = emails.length
    ? await db.select().from(profiles).where(inArray(profiles.email, emails))
    : [];
  const byEmail = new Map(allProfiles.map((profile) => [profile.email, profile]));
  return Response.json({
    catalog: CURATED_GEAR_CATALOG,
    reviews: rows.map((row) => {
      const profile = byEmail.get(row.userEmail);
      return {
        id: row.id,
        catalogId: row.catalogId,
        rating: row.rating,
        body: row.body,
        postId: row.postId,
        createdAt: row.createdAt,
        authorName: profile?.displayName || "Waymark member",
        authorUsername: profile?.username || "waymark.member",
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to review gear." }, { status: 401 });
  const payload = (await request.json()) as {
    catalogId?: string;
    rating?: number;
    body?: string;
    postId?: string | null;
  };
  const catalogId = String(payload.catalogId || "").trim();
  const product = CURATED_GEAR_CATALOG.find((item) => item.id === catalogId);
  if (!product) return Response.json({ error: "Choose a catalog product." }, { status: 400 });
  const rating = Math.round(Number(payload.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }
  const body = String(payload.body || "").trim().slice(0, 280);
  if (body.length < 3) return Response.json({ error: "Write a short review." }, { status: 400 });
  const postId = payload.postId ? String(payload.postId).trim().slice(0, 80) || null : null;
  const now = new Date();
  const db = await getDb();
  const [prior] = await db
    .select()
    .from(gearProductReviews)
    .where(
      and(
        eq(gearProductReviews.userEmail, user.email),
        eq(gearProductReviews.catalogId, catalogId),
      ),
    )
    .limit(1);
  if (prior) {
    await db
      .update(gearProductReviews)
      .set({ rating, body, postId, createdAt: now })
      .where(eq(gearProductReviews.id, prior.id));
    return Response.json({ status: "updated", id: prior.id });
  }
  const id = crypto.randomUUID();
  await db.insert(gearProductReviews).values({
    id,
    userEmail: user.email,
    catalogId,
    rating,
    body,
    postId,
    createdAt: now,
  });
  return Response.json({ status: "created", id }, { status: 201 });
}
