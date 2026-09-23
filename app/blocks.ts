import { and, eq, or } from "drizzle-orm";
import type { getDb } from "../db";
import { blocks, friendships, profiles } from "../db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;

function orderedPair(first: string, second: string) {
  return first.localeCompare(second) < 0 ? [first, second] : [second, first];
}

/** Emails the viewer must not see (either direction of a block). */
export async function blockedCounterpartEmails(db: Db, viewerEmail: string) {
  const rows = await db
    .select()
    .from(blocks)
    .where(or(eq(blocks.blockerEmail, viewerEmail), eq(blocks.blockedEmail, viewerEmail)));
  const emails = new Set(rows.flatMap((row) => [row.blockerEmail, row.blockedEmail]));
  emails.delete(viewerEmail);
  return emails;
}

export async function isPairBlocked(db: Db, firstEmail: string, secondEmail: string) {
  const [row] = await db
    .select()
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerEmail, firstEmail), eq(blocks.blockedEmail, secondEmail)),
        and(eq(blocks.blockerEmail, secondEmail), eq(blocks.blockedEmail, firstEmail)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Insert a block, drop any friendship, return target profile or null. */
export async function blockUserByUsername(db: Db, blockerEmail: string, targetUsername: string) {
  const username = targetUsername.trim().toLowerCase();
  if (!username) return { error: "Choose a member to block.", status: 400 as const };

  const [target] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);
  if (!target || target.email === blockerEmail) {
    return { error: "That Waymark member was not found.", status: 404 as const };
  }

  const [userOneEmail, userTwoEmail] = orderedPair(blockerEmail, target.email);
  const [existing] = await db
    .select()
    .from(friendships)
    .where(
      and(eq(friendships.userOneEmail, userOneEmail), eq(friendships.userTwoEmail, userTwoEmail)),
    )
    .limit(1);
  if (existing) await db.delete(friendships).where(eq(friendships.id, existing.id));

  await db
    .insert(blocks)
    .values({
      id: crypto.randomUUID(),
      blockerEmail,
      blockedEmail: target.email,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return {
    blocked: true as const,
    target: {
      email: target.email,
      username: target.username,
      displayName: target.displayName,
    },
  };
}
