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
  workerUrl.searchParams.set("overdue-activity", `${process.pid}-${Date.now()}-${Math.random()}`);
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
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-overdue-activity",
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

async function setCheckInMinutes(worker, env, cookie, minutes) {
  const result = await jsonFetch(worker, env, "/api/safety", {
    method: "PUT",
    headers: authHeaders(cookie),
    body: JSON.stringify({ contactName: "Alex", contactMethod: "in-app", defaultCheckInMinutes: minutes }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
}

async function planAction(worker, env, cookie, planId, body) {
  const result = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify(body),
  });
  assert.ok(result.response.status < 300, JSON.stringify(result.body));
  return result.body;
}

async function inbox(worker, env, cookie) {
  const result = await jsonFetch(worker, env, "/api/notifications", { headers: authHeaders(cookie) });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function ofType(worker, env, cookie, type) {
  return (await inbox(worker, env, cookie)).notifications.filter((item) => item.type === type);
}

async function runCron(worker, env) {
  const waits = [];
  await worker.scheduled(
    { scheduledTime: Date.now(), cron: "0 * * * *" },
    env,
    { waitUntil(promise) { waits.push(promise); }, passThroughOnException() {} },
  );
  await Promise.all(waits);
}

/** Host plus accepted members, journey started, then pushed 45 minutes into the past. */
async function startedJourney(worker, env, database, hostCookie, members, title) {
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(hostCookie),
    body: JSON.stringify({
      title,
      activityType: "Hiking",
      startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      location: "Fern Gully",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const planId = created.body.plan.id;
  for (const { cookie, email } of members) {
    await planAction(worker, env, cookie, planId, { action: "request" });
    const username = database.prepare("SELECT username FROM profiles WHERE email = ?").get(email).username;
    await planAction(worker, env, hostCookie, planId, { action: "accept", username });
  }
  await planAction(worker, env, hostCookie, planId, { action: "start" });
  const past = Date.now() - 45 * 60 * 1000;
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, planId);
  database.prepare("DELETE FROM notifications").run();
  return planId;
}

test("a missed check-in alerts the host and other members once, then I’m safe follows up once", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const host = await signup(worker, env, "host.oa@example.com", "Host Hiker");
  const late = await signup(worker, env, "late.oa@example.com", "Late Larry");
  const other = await signup(worker, env, "other.oa@example.com", "Other Olive");
  const outsider = await signup(worker, env, "outsider.oa@example.com", "Outsider");
  await setCheckInMinutes(worker, env, late, 30);

  const planId = await startedJourney(worker, env, database, host, [
    { cookie: late, email: "late.oa@example.com" },
    { cookie: other, email: "other.oa@example.com" },
  ], "Overdue Ridge");

  // The bell poll is enough to notice the miss.
  const hostAlerts = await ofType(worker, env, host, "checkin_overdue");
  const otherAlerts = await ofType(worker, env, other, "checkin_overdue");
  assert.equal(hostAlerts.length, 1, JSON.stringify(hostAlerts));
  assert.equal(otherAlerts.length, 1);
  assert.equal(hostAlerts[0].planId, planId);
  assert.equal(hostAlerts[0].planTitle, "Overdue Ridge");
  assert.equal(hostAlerts[0].actorName, "Waymark");
  assert.equal(hostAlerts[0].read, false);
  assert.match(hostAlerts[0].body, /Late Larry missed their 30-minute check-in on “Overdue Ridge”/);
  assert.equal((await ofType(worker, env, late, "checkin_overdue")).length, 0, "overdue person is not alerted");
  assert.equal((await ofType(worker, env, outsider, "checkin_overdue")).length, 0);

  // Repeat reads, action-hub, journey chat and the cron do not duplicate.
  await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(other) });
  await runCron(worker, env);
  await inbox(worker, env, host);
  assert.equal((await ofType(worker, env, host, "checkin_overdue")).length, 1);
  assert.equal((await ofType(worker, env, other, "checkin_overdue")).length, 1);
  const alertIds = database.prepare("SELECT id FROM notifications WHERE type = 'checkin_overdue'").all().map((r) => r.id);
  assert.equal(alertIds.length, 2);
  assert.ok(alertIds.every((id) => id.startsWith(`overdue-checkin:${planId}:`)));

  await planAction(worker, env, late, planId, { action: "safe" });
  const hostSafe = await ofType(worker, env, host, "checkin_safe");
  const otherSafe = await ofType(worker, env, other, "checkin_safe");
  assert.equal(hostSafe.length, 1);
  assert.equal(otherSafe.length, 1);
  assert.equal(hostSafe[0].planId, planId);
  assert.match(hostSafe[0].body, /Late Larry is safe: they marked I’m safe on “Overdue Ridge”/);
  assert.equal((await ofType(worker, env, late, "checkin_safe")).length, 0, "overdue person gets no follow-up");

  // Tapping again, polling again, or finishing does not add more.
  await planAction(worker, env, late, planId, { action: "safe" });
  await runCron(worker, env);
  await planAction(worker, env, host, planId, { action: "complete" });
  assert.equal((await ofType(worker, env, host, "checkin_safe")).length, 1);
  assert.equal((await ofType(worker, env, other, "checkin_safe")).length, 1);
  assert.equal((await ofType(worker, env, host, "checkin_overdue")).length, 1);
});

test("finishing the journey closes an open overdue alert with one follow-up", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const host = await signup(worker, env, "host.finish@example.com", "Finish Host");
  const member = await signup(worker, env, "member.finish@example.com", "Mia Member");
  await setCheckInMinutes(worker, env, host, 30);

  const planId = await startedJourney(worker, env, database, host, [
    { cookie: member, email: "member.finish@example.com" },
  ], "Finish Line");
  await runCron(worker, env);
  assert.equal((await ofType(worker, env, member, "checkin_overdue")).length, 1, "cron alone raises the alert");
  assert.equal((await ofType(worker, env, host, "checkin_overdue")).length, 0);

  await planAction(worker, env, host, planId, { action: "complete" });
  const safe = await ofType(worker, env, member, "checkin_safe");
  assert.equal(safe.length, 1);
  assert.match(safe[0].body, /Finish Host is safe: they finished “Finish Line”/);
  assert.equal((await ofType(worker, env, host, "checkin_safe")).length, 0);
  await runCron(worker, env);
  assert.equal((await ofType(worker, env, member, "checkin_overdue")).length, 1);
});

test("cancelled and completed journeys never raise overdue Activity", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const host = await signup(worker, env, "host.none@example.com", "None Host");
  const member = await signup(worker, env, "member.none@example.com", "None Member");
  await setCheckInMinutes(worker, env, member, 30);
  await setCheckInMinutes(worker, env, host, 30);

  const cancelledId = await startedJourney(worker, env, database, host, [
    { cookie: member, email: "member.none@example.com" },
  ], "Cancelled Climb");
  database.prepare("UPDATE adventure_plans SET status = 'cancelled' WHERE id = ?").run(cancelledId);

  const completedId = await startedJourney(worker, env, database, host, [
    { cookie: member, email: "member.none@example.com" },
  ], "Done Descent");
  await planAction(worker, env, host, completedId, { action: "complete" });
  database.prepare("DELETE FROM notifications").run();

  await runCron(worker, env);
  await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(host) });
  for (const cookie of [host, member]) {
    const items = (await inbox(worker, env, cookie)).notifications;
    assert.equal(items.filter((i) => i.type === "checkin_overdue" || i.type === "checkin_safe").length, 0, JSON.stringify(items));
  }
});

test("Check-in also closes the alert, and a host finish closes a member’s alert without calling them safe", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database);

  const host = await signup(worker, env, "host.close@example.com", "Close Host");
  const member = await signup(worker, env, "member.close@example.com", "Casey Member");
  await setCheckInMinutes(worker, env, member, 30);

  const planId = await startedJourney(worker, env, database, host, [
    { cookie: member, email: "member.close@example.com" },
  ], "Close Track");
  assert.equal((await ofType(worker, env, host, "checkin_overdue")).length, 1);
  await planAction(worker, env, member, planId, { action: "checkin" });
  const afterCheckin = await ofType(worker, env, host, "checkin_safe");
  assert.equal(afterCheckin.length, 1);
  assert.match(afterCheckin[0].body, /Casey Member is safe: they checked in on “Close Track”/);

  // Miss the next window: a new alert for the new window.
  database.prepare("UPDATE plan_members SET checked_in_at = ? WHERE plan_id = ?").run(Date.now() - 40 * 60 * 1000, planId);
  assert.equal((await ofType(worker, env, host, "checkin_overdue")).length, 2);
  assert.equal((await ofType(worker, env, member, "checkin_overdue")).length, 0);

  await planAction(worker, env, host, planId, { action: "complete" });
  const closed = await ofType(worker, env, host, "checkin_safe");
  assert.equal(closed.length, 2);
  assert.match(closed[0].body, /Overdue check-in closed: “Close Track” was marked finished before Casey Member marked I’m safe/);
  assert.equal((await ofType(worker, env, member, "checkin_safe")).length, 0);
});
