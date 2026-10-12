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
  workerUrl.searchParams.set("check-in-overdue", `${process.pid}-${Date.now()}-${Math.random()}`);
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

test("a missed check-in window shows overdue on the plan and posts one chat note until I’m safe", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = {
    DB: new TestD1(database),
    BUCKET: {
      async put() {},
      async head() { return null; },
      async get() { return null; },
      async delete() {},
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-check-in-overdue",
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;
  globalThis.__ROAVLY_TEST_BUCKET__ = env.BUCKET;
  globalThis.__ROAVLY_TEST_UPLOAD_SECRET__ = env.UPLOAD_SIGNING_SECRET;
  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0" };

  const hostSignup = await jsonFetch(worker, env, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "host.overdue@example.com", password: "trailready1", displayName: "Hiker One" }),
  });
  assert.equal(hostSignup.response.status, 201, JSON.stringify(hostSignup.body));
  const hostCookie = cookieFromResponse(hostSignup.response);
  assert.ok(hostCookie);

  const strangerSignup = await jsonFetch(worker, env, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email: "stranger.overdue@example.com", password: "trailready1", displayName: "Stranger" }),
  });
  assert.equal(strangerSignup.response.status, 201, JSON.stringify(strangerSignup.body));
  const strangerCookie = cookieFromResponse(strangerSignup.response);
  assert.ok(strangerCookie);

  const safety = await jsonFetch(worker, env, "/api/safety", {
    method: "PUT",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ contactName: "Alex", contactMethod: "in-app", defaultCheckInMinutes: 30 }),
  });
  assert.equal(safety.response.status, 200, JSON.stringify(safety.body));
  assert.equal(safety.body.safety.defaultCheckInMinutes, 30);

  const startsAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({
      title: "Overdue window hike",
      activityType: "Hiking",
      startsAt,
      location: "Fern Gully",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const planId = created.body.plan.id;

  const chat = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "create_chat" }),
  });
  assert.equal(chat.response.status, 201, JSON.stringify(chat.body));
  const conversationId = chat.body.conversationId;

  const beforeStart = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  const beforePlan = beforeStart.body.plans.find((plan) => plan.id === planId);
  assert.equal(beforePlan.checkInOverdue, false);

  const started = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "start" }),
  });
  assert.equal(started.response.status, 200, JSON.stringify(started.body));

  const insideWindow = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  const freshPlan = insideWindow.body.plans.find((plan) => plan.id === planId);
  assert.equal(freshPlan.checkInOverdue, false);
  assert.equal(freshPlan.members.find((member) => member.isViewer).checkInOverdue, false);

  const earlyMessages = await jsonFetch(worker, env, `/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(hostCookie),
  });
  assert.equal(earlyMessages.response.status, 200, JSON.stringify(earlyMessages.body));
  assert.equal(earlyMessages.body.messages.filter((message) => message.body.includes("Check-in overdue")).length, 0);

  const past = Date.now() - 45 * 60 * 1000;
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, planId);

  const overdueHub = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  const overduePlan = overdueHub.body.plans.find((plan) => plan.id === planId);
  assert.equal(overduePlan.checkInOverdue, true, JSON.stringify(overduePlan));
  const overdueMember = overduePlan.members.find((member) => member.isViewer);
  assert.equal(overdueMember.checkInOverdue, true);
  assert.equal(overdueMember.safeAt, null);

  const strangerHub = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(strangerCookie) });
  const strangerPlan = strangerHub.body.plans.find((plan) => plan.id === planId);
  assert.ok(strangerPlan, "public plan is still listed");
  assert.equal(strangerPlan.checkInOverdue, false);
  assert.equal(strangerPlan.members.every((member) => !member.checkInOverdue), true);

  const noted = await jsonFetch(worker, env, `/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(hostCookie),
  });
  const overdueNotes = noted.body.messages.filter((message) => message.body.includes("Check-in overdue"));
  assert.equal(overdueNotes.length, 1, JSON.stringify(noted.body.messages));
  assert.equal(overdueNotes[0].isSystem, true);
  assert.equal(overdueNotes[0].authorName, "Waymark");
  assert.equal(overdueNotes[0].isMine, false);
  assert.match(overdueNotes[0].body, /Hiker One/);
  assert.match(overdueNotes[0].body, /30-minute/);
  assert.match(overdueNotes[0].body, /I’m safe/);

  const notedAgain = await jsonFetch(worker, env, `/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(hostCookie),
  });
  assert.equal(notedAgain.body.messages.filter((message) => message.body.includes("Check-in overdue")).length, 1);

  const inbox = await jsonFetch(worker, env, "/api/conversations", { headers: authHeaders(hostCookie) });
  const summary = inbox.body.conversations.find((conversation) => conversation.id === conversationId);
  assert.match(summary.lastMessage.body, /Check-in overdue/);

  const markedSafe = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "safe" }),
  });
  assert.equal(markedSafe.response.status, 200, JSON.stringify(markedSafe.body));
  const cleared = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  const clearedPlan = cleared.body.plans.find((plan) => plan.id === planId);
  assert.equal(clearedPlan.checkInOverdue, false);
  assert.equal(clearedPlan.members.find((member) => member.isViewer).checkInOverdue, false);
  const afterSafe = await jsonFetch(worker, env, `/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(hostCookie),
  });
  assert.equal(afterSafe.body.messages.filter((message) => message.body.includes("Check-in overdue")).length, 1);

  const checkin = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "checkin" }),
  });
  assert.equal(checkin.response.status, 200, JSON.stringify(checkin.body));
  const restarted = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  assert.equal(restarted.body.plans.find((plan) => plan.id === planId).checkInOverdue, false);

  const laterPast = Date.now() - 40 * 60 * 1000;
  database.prepare("UPDATE plan_members SET checked_in_at = ? WHERE plan_id = ?").run(laterPast, planId);
  const overdueAgain = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  assert.equal(overdueAgain.body.plans.find((plan) => plan.id === planId).checkInOverdue, true);
  const secondNotes = await jsonFetch(worker, env, `/api/conversations/${conversationId}/messages`, {
    headers: authHeaders(hostCookie),
  });
  assert.equal(secondNotes.body.messages.filter((message) => message.body.includes("Check-in overdue")).length, 2);

  const completed = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "complete" }),
  });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  const done = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(hostCookie) });
  assert.equal(done.body.plans.find((plan) => plan.id === planId).checkInOverdue, false);
});
