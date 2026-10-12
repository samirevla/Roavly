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
  workerUrl.searchParams.set("journey-reminders", `${process.pid}-${Date.now()}-${Math.random()}`);
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

function baseEnv(database) {
  const env = {
    DB: new TestD1(database),
    BUCKET: {
      async put() {},
      async head() { return null; },
      async get() { return null; },
      async delete() {},
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-journey-reminders",
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;
  globalThis.__ROAVLY_TEST_BUCKET__ = env.BUCKET;
  globalThis.__ROAVLY_TEST_UPLOAD_SECRET__ = env.UPLOAD_SIGNING_SECRET;
  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0" };
  return env;
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

async function inbox(worker, env, cookie) {
  const result = await jsonFetch(worker, env, "/api/notifications", { headers: authHeaders(cookie) });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function triggerReminders(worker, env, cookie) {
  const result = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

test("journey reminders land once for host and accepted members about 24h out", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const hostCookie = await signup(worker, env, "host.remind@example.com", "Host Reminder");
  const memberCookie = await signup(worker, env, "member.remind@example.com", "Member Reminder");
  const outsiderCookie = await signup(worker, env, "outsider.remind@example.com", "Outsider");

  // Host has a safety contact; member does not.
  const safety = await jsonFetch(worker, env, "/api/safety", {
    method: "PUT",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ contactName: "Pat", contactMethod: "+61400000000", defaultCheckInMinutes: 120 }),
  });
  assert.equal(safety.response.status, 200, JSON.stringify(safety.body));

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({
      title: "Alpine Ridgeline",
      activityType: "Hiking",
      startsAt: startsAt.toISOString(),
      location: "Falls Creek",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const planId = created.body.plan.id;

  await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(memberCookie),
    body: JSON.stringify({ action: "request" }),
  });
  const memberUsername = database
    .prepare("SELECT username FROM profiles WHERE email = ?")
    .get("member.remind@example.com").username;
  const accept = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "accept", username: memberUsername }),
  });
  assert.ok(accept.response.status < 300, JSON.stringify(accept.body));

  // Clear join-related notifications so we only assert on reminders.
  database.prepare("DELETE FROM notifications").run();

  await triggerReminders(worker, env, hostCookie);

  const hostInbox = await inbox(worker, env, hostCookie);
  const memberInbox = await inbox(worker, env, memberCookie);
  const outsiderInbox = await inbox(worker, env, outsiderCookie);

  const hostReminders = hostInbox.notifications.filter((item) => item.type === "journey_reminder");
  const memberReminders = memberInbox.notifications.filter((item) => item.type === "journey_reminder");
  assert.equal(hostReminders.length, 1, JSON.stringify(hostInbox.notifications));
  assert.equal(memberReminders.length, 1, JSON.stringify(memberInbox.notifications));
  assert.equal(outsiderInbox.notifications.filter((item) => item.type === "journey_reminder").length, 0);

  assert.equal(hostReminders[0].planId, planId);
  assert.equal(hostReminders[0].planTitle, "Alpine Ridgeline");
  assert.equal(hostReminders[0].read, false);
  assert.equal(hostReminders[0].actorName, "Waymark");
  assert.match(hostReminders[0].body, /^Tomorrow: Alpine Ridgeline,/);
  assert.doesNotMatch(hostReminders[0].body, /safety contact/i);

  assert.match(memberReminders[0].body, /^Tomorrow: Alpine Ridgeline,/);
  assert.match(memberReminders[0].body, /Add a safety contact before you go/i);

  // Second run creates no duplicates (action-hub catch-up + scheduled path share ids).
  await triggerReminders(worker, env, hostCookie);
  if (typeof worker.scheduled === "function") {
    const waits = [];
    await worker.scheduled(
      { scheduledTime: Date.now(), cron: "0 * * * *" },
      env,
      { waitUntil(promise) { waits.push(promise); }, passThroughOnException() {} },
    );
    await Promise.all(waits);
  }
  assert.equal((await inbox(worker, env, hostCookie)).notifications.filter((i) => i.type === "journey_reminder").length, 1);
  assert.equal((await inbox(worker, env, memberCookie)).notifications.filter((i) => i.type === "journey_reminder").length, 1);

  const rows = database.prepare("SELECT id, recipient_email, type FROM notifications WHERE type = ?").all("journey_reminder");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.id.startsWith(`journey-reminder:${planId}:`)));
});

test("cancelled and already-started journeys do not get journey reminders", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const hostCookie = await signup(worker, env, "host.cancel.remind@example.com", "Cancel Host");

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({
      title: "Cancelled Spur",
      activityType: "Hiking",
      startsAt: startsAt.toISOString(),
      location: "Spur Track",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const planId = created.body.plan.id;

  const cancel = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({ action: "cancel" }),
  });
  assert.ok(cancel.response.status < 300, JSON.stringify(cancel.body));

  database.prepare("DELETE FROM notifications").run();
  await triggerReminders(worker, env, hostCookie);
  assert.equal(
    (await inbox(worker, env, hostCookie)).notifications.filter((i) => i.type === "journey_reminder").length,
    0,
  );

  // Past journey inserted directly — must not remind.
  const pastId = crypto.randomUUID();
  const pastStart = Date.now() - 2 * 60 * 60 * 1000;
  database
    .prepare(
      `INSERT INTO adventure_plans
        (id, host_email, title, activity_type, starts_at, location, experience_level, pace, equipment, capacity, visibility, status, safety_notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pastId,
      "host.cancel.remind@example.com",
      "Already gone",
      "Hiking",
      pastStart,
      "Old Trail",
      "All levels",
      "Flexible",
      "",
      8,
      "public",
      "scheduled",
      "",
      Date.now(),
      Date.now(),
    );
  database
    .prepare(
      `INSERT INTO plan_members (id, plan_id, user_email, status, requested_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), pastId, "host.cancel.remind@example.com", "accepted", Date.now(), Date.now());

  await triggerReminders(worker, env, hostCookie);
  assert.equal(
    (await inbox(worker, env, hostCookie)).notifications.filter((i) => i.type === "journey_reminder").length,
    0,
  );
});

test("journeys outside the 25h window are not reminded yet", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const hostCookie = await signup(worker, env, "host.far.remind@example.com", "Far Host");
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({
      title: "Next Week Ridge",
      activityType: "Hiking",
      startsAt: startsAt.toISOString(),
      location: "Far Peak",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  database.prepare("DELETE FROM notifications").run();
  await triggerReminders(worker, env, hostCookie);
  assert.equal(
    (await inbox(worker, env, hostCookie)).notifications.filter((i) => i.type === "journey_reminder").length,
    0,
  );
});
