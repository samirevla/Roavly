import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(join(root, relativePath), "utf8");
}

/** Mirror of app/rate-limit.ts sliding-window helper for Node without a TS loader. */
function createRateLimiter() {
  const buckets = new Map();

  function checkRateLimit(key, window, now = Date.now()) {
    const windowStart = now - window.windowMs;
    const prior = buckets.get(key) ?? [];
    const recent = prior.filter((timestamp) => timestamp > windowStart);
    if (recent.length >= window.limit) {
      buckets.set(key, recent);
      const retryAfterMs = recent[0] + window.windowMs - now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        remaining: 0,
      };
    }
    recent.push(now);
    buckets.set(key, recent);
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, window.limit - recent.length),
    };
  }

  return { checkRateLimit, reset: () => buckets.clear() };
}

test("rate-limit helper module documents isolate-local Workers caveat and exports caps", async () => {
  const moduleSource = await source("app/rate-limit.ts");
  assert.match(moduleSource, /Isolate-local sliding-window rate limiter/);
  assert.match(moduleSource, /shared across isolates\/regions/);
  assert.match(moduleSource, /posts:\s*\{\s*limit:\s*10/);
  assert.match(moduleSource, /comments:\s*\{\s*limit:\s*30/);
  assert.match(moduleSource, /messages:\s*\{\s*limit:\s*60/);
  assert.match(moduleSource, /diagnostics:\s*\{\s*limit:\s*20/);
  assert.match(moduleSource, /export function enforceRateLimit/);
  assert.match(moduleSource, /status:\s*429/);
});

test("sliding window allows up to the cap then rejects", () => {
  const { checkRateLimit, reset } = createRateLimiter();
  reset();
  const window = { limit: 3, windowMs: 60_000 };
  const t0 = 1_000_000;
  assert.equal(checkRateLimit("u:a", window, t0).allowed, true);
  assert.equal(checkRateLimit("u:a", window, t0 + 1).allowed, true);
  assert.equal(checkRateLimit("u:a", window, t0 + 2).allowed, true);
  const blocked = checkRateLimit("u:a", window, t0 + 3);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("sliding window expires old hits and keys stay isolated", () => {
  const { checkRateLimit, reset } = createRateLimiter();
  reset();
  const window = { limit: 2, windowMs: 1_000 };
  const t0 = 5_000_000;
  assert.equal(checkRateLimit("posts:a@x", window, t0).allowed, true);
  assert.equal(checkRateLimit("posts:a@x", window, t0 + 10).allowed, true);
  assert.equal(checkRateLimit("posts:a@x", window, t0 + 20).allowed, false);
  // After the window, first hit falls out.
  assert.equal(checkRateLimit("posts:a@x", window, t0 + 1_011).allowed, true);
  // Separate key is unaffected.
  assert.equal(checkRateLimit("posts:b@x", window, t0 + 1_011).allowed, true);
  assert.equal(checkRateLimit("posts:b@x", window, t0 + 1_012).allowed, true);
  assert.equal(checkRateLimit("posts:b@x", window, t0 + 1_013).allowed, false);
});

test("write routes wire enforceRateLimit with expected buckets", async () => {
  const posts = await source("app/api/posts/route.ts");
  const comments = await source("app/api/posts/[id]/comments/route.ts");
  const messages = await source("app/api/conversations/[id]/messages/route.ts");
  const diagnostics = await source("app/api/client-diagnostics/route.ts");
  const motivate = await source("app/api/posts/[id]/motivate/route.ts");
  const report = await source("app/api/posts/[id]/report/route.ts");

  assert.match(posts, /enforceRateLimit\(`posts:\$\{user\.email\}`, RATE_LIMITS\.posts\)/);
  assert.match(comments, /enforceRateLimit\(`comments:\$\{user\.email\}`, RATE_LIMITS\.comments\)/);
  assert.match(messages, /enforceRateLimit\(`messages:\$\{user\.email\}`, RATE_LIMITS\.messages\)/);
  assert.match(diagnostics, /RATE_LIMITS\.diagnostics/);
  assert.match(diagnostics, /clientIpFromRequest/);
  assert.match(motivate, /RATE_LIMITS\.motivate/);
  assert.match(report, /RATE_LIMITS\.report/);
  const tipReport = await source("app/api/tips/[id]/report/route.ts");
  assert.match(tipReport, /RATE_LIMITS\.report/);
});

function assertNoBareProfilesSelect(label, sourceText) {
  // Flag full-table profile loads: select().from(profiles) without a following .where(
  // on the same chain (allowing whitespace/newlines).
  const bare = /db\.select\(\)\s*\.from\(\s*profiles\s*\)(?!\s*\.where\s*\()/g;
  const matches = sourceText.match(bare) || [];
  assert.equal(
    matches.length,
    0,
    `${label} still has bare db.select().from(profiles) without where/inArray`,
  );
  assert.match(
    sourceText,
    /from\(\s*profiles\s*\)\s*\.where\(\s*inArray\(/,
    `${label} should load profiles via inArray where`,
  );
}

test("hot-path routes no longer full-scan profiles", async () => {
  const conversations = await source("app/api/conversations/route.ts");
  const messages = await source("app/api/conversations/[id]/messages/route.ts");
  const actionHub = await source("app/api/action-hub/route.ts");
  const posts = await source("app/api/posts/route.ts");
  const comments = await source("app/api/posts/[id]/comments/route.ts");

  assertNoBareProfilesSelect("conversations", conversations);
  assertNoBareProfilesSelect("messages", messages);
  assertNoBareProfilesSelect("action-hub", actionHub);
  assertNoBareProfilesSelect("posts feed", posts);
  assertNoBareProfilesSelect("comments", comments);

  // Feed still has a single-email profile lookup on create — that is fine.
  assert.match(posts, /where\(eq\(profiles\.email, user\.email\)\)/);
});

test("action-hub also scopes plans/clubs instead of loading every row", async () => {
  const actionHub = await source("app/api/action-hub/route.ts");
  assert.doesNotMatch(
    actionHub,
    /db\.select\(\)\s*\.from\(\s*adventurePlans\s*\)\s*\.orderBy/,
    "action-hub should not load all adventurePlans without a where",
  );
  assert.match(actionHub, /inArray\(adventurePlans\.id/);
  assert.match(actionHub, /inArray\(profiles\.email, profileEmailList\)/);
});
