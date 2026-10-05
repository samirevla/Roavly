import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

class D1Statement {
  constructor(statement, params = []) {
    this.statement = statement;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.statement, params);
  }

  async all() {
    return { success: true, results: this.statement.all(...this.params), meta: emptyMeta() };
  }

  async raw() {
    return this.statement.all(...this.params).map((row) => Object.values(row));
  }

  async run() {
    const result = this.statement.run(...this.params);
    return {
      success: true,
      results: [],
      meta: { ...emptyMeta(), changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  }

  async first(column) {
    const row = this.statement.get(...this.params);
    return column ? row?.[column] ?? null : row ?? null;
  }
}

class TestD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1Statement(this.database.prepare(sql));
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.all()));
  }

  async exec(sql) {
    this.database.exec(sql);
    return { count: 1, duration: 0 };
  }
}

function emptyMeta() {
  return {
    duration: 0,
    changes: 0,
    last_row_id: 0,
    changed_db: false,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
  };
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationDirectory), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  return database;
}

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("activity-inbox", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function runtimeContext() {
  return { waitUntil() {}, passThroughOnException() {} };
}

function cookieFromResponse(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const header = raw.find((value) => value.startsWith("roavly_session=")) || response.headers.get("set-cookie") || "";
  const match = /(?:^|,\s*)roavly_session=([^;]+)/.exec(header);
  return match?.[1] || null;
}

async function jsonFetch(worker, env, pathname, init = {}) {
  const headers = { "content-type": "application/json", ...(init.headers || {}) };
  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, { ...init, headers }),
    env,
    runtimeContext(),
  );
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function authHeaders(cookie) {
  return { cookie: `roavly_session=${cookie}` };
}

async function signup(worker, env, email, displayName) {
  const result = await jsonFetch(worker, env, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password: "trailready1", displayName }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  const cookie = cookieFromResponse(result.response);
  assert.ok(cookie);
  return cookie;
}

function baseEnv(database, extra = {}) {
  const env = {
    DB: new TestD1(database),
    BUCKET: {
      async put() {},
      async head() { return null; },
      async get() { return null; },
      async delete() {},
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-activity-inbox",
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;
  globalThis.__ROAVLY_TEST_BUCKET__ = env.BUCKET;
  globalThis.__ROAVLY_TEST_UPLOAD_SECRET__ = env.UPLOAD_SIGNING_SECRET;
  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0", ...extra };
  return env;
}


function username(database, email) {
  return database.prepare("SELECT username FROM profiles WHERE email = ?").get(email).username;
}

function insertPost(database, email, name) {
  const id = crypto.randomUUID();
  database
    .prepare("INSERT INTO posts (id, author_email, author_name, caption, location, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, email, name, "Sunrise loop", "Mount Dandenong", Math.floor(Date.now() / 1000));
  return id;
}

async function inbox(worker, env, cookie) {
  const result = await jsonFetch(worker, env, "/api/notifications", { headers: authHeaders(cookie) });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function post(worker, env, cookie, pathname, body) {
  const result = await jsonFetch(worker, env, pathname, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify(body),
  });
  assert.ok(result.response.status < 300, `${pathname} ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

test("activity inbox records comments, motivations, journey joins and host plan changes", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);
  const owner = await signup(worker, env, "owner.inbox@example.com", "Owner One");
  const friend = await signup(worker, env, "friend.inbox@example.com", "Friend Two");
  const joiner = await signup(worker, env, "joiner.inbox@example.com", "Joiner Three");

  const unauth = await jsonFetch(worker, env, "/api/notifications");
  assert.equal(unauth.response.status, 401);

  // Posts: comment + motivate notify the author; self-activity does not.
  const postId = insertPost(database, "owner.inbox@example.com", "Owner One");
  await post(worker, env, friend, `/api/posts/${postId}/comments`, { body: "🔥 Keep it going!" });
  await post(worker, env, friend, `/api/posts/${postId}/motivate`, {});
  await post(worker, env, owner, `/api/posts/${postId}/comments`, { body: "💪 Strong work!" });
  await post(worker, env, owner, `/api/posts/${postId}/motivate`, {});

  let ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.unreadCount, 2);
  assert.deepEqual(ownerInbox.notifications.map((item) => item.type).sort(), ["comment", "motivate"]);
  const comment = ownerInbox.notifications.find((item) => item.type === "comment");
  assert.equal(comment.postId, postId);
  assert.equal(comment.body, "🔥 Keep it going!");
  assert.equal(comment.actorName, "Friend Two");
  assert.equal(comment.read, false);
  assert.match(comment.postLabel, /Mount Dandenong/);

  // Toggling motivation off and on does not stack rows.
  await post(worker, env, friend, `/api/posts/${postId}/motivate`, {});
  await post(worker, env, friend, `/api/posts/${postId}/motivate`, {});
  ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.notifications.filter((item) => item.type === "motivate").length, 1);

  // Mark one read, then all read.
  const readOne = await post(worker, env, owner, "/api/notifications", { action: "read", id: comment.id });
  assert.equal(readOne.unreadCount, 1);
  const readAll = await post(worker, env, owner, "/api/notifications", { action: "read_all" });
  assert.equal(readAll.unreadCount, 0);
  ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.unreadCount, 0);
  assert.ok(ownerInbox.notifications.every((item) => item.read));

  // Another user cannot mark my rows read.
  await post(worker, env, joiner, `/api/posts/${postId}/motivate`, {});
  const unread = (await inbox(worker, env, owner)).notifications.find((item) => !item.read);
  await post(worker, env, friend, "/api/notifications", { action: "read", id: unread.id });
  assert.equal((await inbox(worker, env, owner)).unreadCount, 1);
  await post(worker, env, owner, "/api/notifications", { action: "read_all" });

  // Journeys: request → host, host accept → requester, invite accepted → host.
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const created = await post(worker, env, owner, "/api/plans", {
    title: "Sunrise ridge",
    activityType: "Hiking",
    startsAt,
    location: "Fern Gully",
    visibility: "public",
  });
  const planId = created.plan.id;
  await post(worker, env, joiner, `/api/plans/${planId}`, { action: "request" });
  ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.unreadCount, 1);
  assert.equal(ownerInbox.notifications[0].type, "plan_request");
  assert.equal(ownerInbox.notifications[0].planId, planId);
  assert.equal(ownerInbox.notifications[0].planTitle, "Sunrise ridge");

  await post(worker, env, owner, `/api/plans/${planId}`, {
    action: "accept",
    username: username(database, "joiner.inbox@example.com"),
  });
  const joinerInbox = await inbox(worker, env, joiner);
  assert.equal(joinerInbox.notifications[0].type, "plan_accepted");
  assert.equal(joinerInbox.notifications[0].actorName, "Owner One");

  await post(worker, env, owner, "/api/friends", {
    targetUsername: username(database, "friend.inbox@example.com"),
    action: "request",
  });
  await post(worker, env, friend, "/api/friends", {
    targetUsername: username(database, "owner.inbox@example.com"),
    action: "accept",
  });
  await post(worker, env, owner, `/api/plans/${planId}`, {
    action: "invite",
    username: username(database, "friend.inbox@example.com"),
  });
  await post(worker, env, friend, `/api/plans/${planId}`, { action: "accept_invite" });
  ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.notifications[0].type, "plan_join");
  assert.equal(ownerInbox.notifications[0].actorName, "Friend Two");

  // Host update notifies everyone accepted on the plan, never the host.
  const before = (await inbox(worker, env, owner)).notifications.length;
  await post(worker, env, owner, `/api/plans/${planId}`, {
    action: "update",
    title: "Sunrise ridge",
    startsAt,
    location: "Sherbrooke Falls",
  });
  for (const cookie of [joiner, friend]) {
    const latest = (await inbox(worker, env, cookie)).notifications[0];
    assert.equal(latest.type, "plan_update");
    assert.equal(latest.planId, planId);
    assert.match(latest.body, /Sherbrooke Falls/);
  }
  assert.equal((await inbox(worker, env, owner)).notifications.length, before);

  // No-op update sends nothing new.
  const joinerCount = (await inbox(worker, env, joiner)).notifications.length;
  await post(worker, env, owner, `/api/plans/${planId}`, {
    action: "update",
    title: "Sunrise ridge",
    startsAt,
    location: "Sherbrooke Falls",
  });
  assert.equal((await inbox(worker, env, joiner)).notifications.length, joinerCount);

  // Deleted posts drop out of the inbox.
  database.prepare("DELETE FROM posts WHERE id = ?").run(postId);
  ownerInbox = await inbox(worker, env, owner);
  assert.ok(ownerInbox.notifications.every((item) => item.postId !== postId));
});

test("blocked members do not reach the activity inbox", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);
  const owner = await signup(worker, env, "owner.block@example.com", "Owner Block");
  const other = await signup(worker, env, "other.block@example.com", "Other Block");
  const postId = insertPost(database, "owner.block@example.com", "Owner Block");
  await post(worker, env, owner, "/api/blocks", { username: username(database, "other.block@example.com") });
  await jsonFetch(worker, env, `/api/posts/${postId}/motivate`, { method: "POST", headers: authHeaders(other) });
  const ownerInbox = await inbox(worker, env, owner);
  assert.equal(ownerInbox.unreadCount, 0);
  assert.equal(ownerInbox.notifications.length, 0);
});

test("the header bell opens the activity inbox and keeps friend requests", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const inboxUi = await readFile(new URL("../app/components/activity-inbox.tsx", import.meta.url), "utf8");
  const discover = await readFile(new URL("../app/components/discover-view.tsx", import.meta.url), "utf8");
  assert.match(page, /onClick=\{openInbox\}/);
  assert.doesNotMatch(page, /onClick=\{\(\) => setActiveNav\("Friends"\)\} aria-label="[^"]*notifications"/);
  assert.match(page, /bellCount = inboxUnread \+ incomingRequests\.length/);
  assert.match(page, /action: "read_all"/);
  assert.match(page, /revealElement\(`post-\$\{postId\}`/);
  assert.match(page, /revealElement\(`plan-\$\{planId\}`/);
  assert.match(inboxUi, /Friend requests/);
  assert.match(inboxUi, /onAcceptFriend/);
  assert.match(discover, /id=\{`plan-\$\{plan\.id\}`\}/);
});
