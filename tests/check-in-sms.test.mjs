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
  workerUrl.searchParams.set("check-in-sms", `${process.pid}-${Date.now()}-${Math.random()}`);
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

function installSmsSpy() {
  const calls = [];
  globalThis.__ROAVLY_TEST_SMS_FETCH__ = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ sid: "SMtest" }), { status: 201, headers: { "content-type": "application/json" } });
  };
  return calls;
}

function parsedSms(call) {
  const params = new URLSearchParams(call.init.body);
  return {
    to: params.get("To"),
    from: params.get("From"),
    body: params.get("Body") || "",
    authorization: call.init.headers.authorization,
  };
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

async function saveSafety(worker, env, cookie, contactMethod, minutes = 30) {
  const safety = await jsonFetch(worker, env, "/api/safety", {
    method: "PUT",
    headers: authHeaders(cookie),
    body: JSON.stringify({ contactName: "Alex", contactMethod, defaultCheckInMinutes: minutes }),
  });
  assert.equal(safety.response.status, 200, JSON.stringify(safety.body));
}

async function startPlan(worker, env, cookie, title) {
  const startsAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const created = await jsonFetch(worker, env, "/api/plans", {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({
      title,
      activityType: "Hiking",
      startsAt,
      location: "Fern Gully",
      visibility: "public",
    }),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const planId = created.body.plan.id;
  const started = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "start" }),
  });
  assert.equal(started.response.status, 200, JSON.stringify(started.body));
  return planId;
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
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-check-in-sms",
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;
  globalThis.__ROAVLY_TEST_BUCKET__ = env.BUCKET;
  globalThis.__ROAVLY_TEST_UPLOAD_SECRET__ = env.UPLOAD_SIGNING_SECRET;
  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0", ...extra };
  return env;
}

const twilioEnv = {
  TWILIO_ACCOUNT_SID: "ACcheckinsms0000000000000000000",
  TWILIO_AUTH_TOKEN: "test-auth-token",
  TWILIO_FROM_NUMBER: "+15550001111",
};

test("overdue check-in texts the saved contact once per window, and stops after I’m safe or complete", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database, twilioEnv);
  const calls = installSmsSpy();
  const cookie = await signup(worker, env, "host.sms@example.com", "Hiker One");
  await saveSafety(worker, env, cookie, "+61 400 111 222");

  const planId = await startPlan(worker, env, cookie, "SMS window hike");
  const inside = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(inside.response.status, 200, JSON.stringify(inside.body));
  assert.equal(inside.body.smsAlertsEnabled, true);
  assert.equal(inside.body.plans.find((plan) => plan.id === planId).checkInOverdue, false);
  assert.equal(calls.length, 0, "no SMS inside the check-in window");

  const markedSafe = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "safe" }),
  });
  assert.equal(markedSafe.response.status, 200, JSON.stringify(markedSafe.body));
  const past = Date.now() - 45 * 60 * 1000;
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, planId);
  const whileSafe = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(whileSafe.body.plans.find((plan) => plan.id === planId).checkInOverdue, false);
  assert.equal(calls.length, 0, "I’m safe stops the SMS");

  const checkin = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "checkin" }),
  });
  assert.equal(checkin.response.status, 200, JSON.stringify(checkin.body));
  const fresh = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(fresh.body.plans.find((plan) => plan.id === planId).checkInOverdue, false);
  assert.equal(calls.length, 0);

  const laterPast = Date.now() - 40 * 60 * 1000;
  database.prepare("UPDATE plan_members SET checked_in_at = ? WHERE plan_id = ?").run(laterPast, planId);
  const overdue = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(overdue.body.plans.find((plan) => plan.id === planId).checkInOverdue, true);
  assert.equal(calls.length, 1, "one SMS after the window");
  const sms = parsedSms(calls[0]);
  assert.equal(sms.to, "+61400111222");
  assert.equal(sms.from, "+15550001111");
  assert.match(sms.body, /Hiker One/);
  assert.match(sms.body, /Waymark/);
  assert.match(sms.body, /missed a check-in/);
  assert.doesNotMatch(sms.body, /Fern Gully/);
  assert.equal(sms.authorization, `Basic ${btoa(`${twilioEnv.TWILIO_ACCOUNT_SID}:${twilioEnv.TWILIO_AUTH_TOKEN}`)}`);
  assert.match(calls[0].url, /\/Accounts\/ACcheckinsms0000000000000000000\/Messages\.json$/);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM check_in_sms").get().n, 1);

  const again = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(again.body.plans.find((plan) => plan.id === planId).checkInOverdue, true);
  assert.equal(calls.length, 1, "a second read does not send again");
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM check_in_sms").get().n, 1);

  const safeAgain = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "safe" }),
  });
  assert.equal(safeAgain.response.status, 200);
  await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(calls.length, 1);

  const checkinAgain = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "checkin" }),
  });
  assert.equal(checkinAgain.response.status, 200);
  const newerPast = Date.now() - 50 * 60 * 1000;
  database.prepare("UPDATE plan_members SET checked_in_at = ? WHERE plan_id = ?").run(newerPast, planId);
  const secondWindow = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(secondWindow.body.plans.find((plan) => plan.id === planId).checkInOverdue, true);
  assert.equal(calls.length, 2, "a new missed window can send one new SMS");
  await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(calls.length, 2);

  const completed = await jsonFetch(worker, env, `/api/plans/${planId}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "complete" }),
  });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(calls.length, 2, "completing the journey does not send again");

  const stopped = await startPlan(worker, env, cookie, "Complete before the window");
  const completedEarly = await jsonFetch(worker, env, `/api/plans/${stopped}`, {
    method: "POST",
    headers: authHeaders(cookie),
    body: JSON.stringify({ action: "complete" }),
  });
  assert.equal(completedEarly.response.status, 200, JSON.stringify(completedEarly.body));
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, stopped);
  const afterComplete = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(afterComplete.body.plans.find((plan) => plan.id === stopped).checkInOverdue, false);
  assert.equal(calls.length, 2, "a completed journey does not text even after the window");
});

test("missing phone or missing Twilio config does not send and does not throw", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database, twilioEnv);
  const calls = installSmsSpy();
  const cookie = await signup(worker, env, "host.nophone@example.com", "Hiker Two");
  await saveSafety(worker, env, cookie, "alex@example.com");
  const planId = await startPlan(worker, env, cookie, "No phone hike");
  const past = Date.now() - 45 * 60 * 1000;
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, planId);
  const overdue = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(overdue.response.status, 200, JSON.stringify(overdue.body));
  assert.equal(overdue.body.plans.find((plan) => plan.id === planId).checkInOverdue, true);
  assert.equal(overdue.body.smsAlertsEnabled, true);
  assert.equal(calls.length, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM check_in_sms").get().n, 0);

  await saveSafety(worker, env, cookie, "in-app");
  const labeled = await startPlan(worker, env, cookie, "Label only hike");
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, labeled);
  const labeledHub = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(labeledHub.response.status, 200);
  assert.equal(labeledHub.body.plans.find((plan) => plan.id === labeled).checkInOverdue, true);
  assert.equal(calls.length, 0);

  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0" };
  await saveSafety(worker, env, cookie, "0412345678");
  const unconfigured = await startPlan(worker, env, cookie, "No secrets hike");
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, unconfigured);
  const quiet = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(quiet.response.status, 200, JSON.stringify(quiet.body));
  assert.equal(quiet.body.smsAlertsEnabled, false);
  assert.equal(quiet.body.plans.find((plan) => plan.id === unconfigured).checkInOverdue, true);
  assert.equal(calls.length, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM check_in_sms").get().n, 0);

  globalThis.__ROAVLY_TEST_ENV__ = {
    ROAVLY_ALLOW_SITES_HEADERS: "0",
    TWILIO_ACCOUNT_SID: twilioEnv.TWILIO_ACCOUNT_SID,
  };
  const partial = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(partial.response.status, 200);
  assert.equal(partial.body.smsAlertsEnabled, false);
  assert.equal(calls.length, 0);
});

test("an Australian mobile in the safety circle is texted once", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const env = baseEnv(database, twilioEnv);
  const calls = installSmsSpy();
  const cookie = await signup(worker, env, "host.au@example.com", "Hiker Three");
  await saveSafety(worker, env, cookie, "0412 345 678");
  const planId = await startPlan(worker, env, cookie, "AU mobile hike");
  const past = Date.now() - 45 * 60 * 1000;
  database.prepare("UPDATE adventure_plans SET started_at = ?, starts_at = ? WHERE id = ?").run(past, past, planId);
  const overdue = await jsonFetch(worker, env, "/api/action-hub", { headers: authHeaders(cookie) });
  assert.equal(overdue.response.status, 200, JSON.stringify(overdue.body));
  assert.equal(calls.length, 1);
  assert.equal(parsedSms(calls[0]).to, "+61412345678");
  assert.match(parsedSms(calls[0]).body, /Hiker Three/);
});
