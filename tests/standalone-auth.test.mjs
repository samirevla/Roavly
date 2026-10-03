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
    return {
      success: true,
      results: this.statement.all(...this.params),
      meta: emptyMeta(),
    };
  }

  async raw() {
    return this.statement
      .all(...this.params)
      .map((row) => Object.values(row));
  }

  async run() {
    const result = this.statement.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        ...emptyMeta(),
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
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
  workerUrl.searchParams.set(
    "standalone-auth",
    `${process.pid}-${Date.now()}-${Math.random()}`,
  );
  return (await import(workerUrl.href)).default;
}

function runtimeContext() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

function cookieFromResponse(response) {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const header =
    raw.find((value) => value.startsWith("roavly_session=")) ||
    response.headers.get("set-cookie") ||
    "";
  const match = /(?:^|,\s*)roavly_session=([^;]+)/.exec(header);
  return match?.[1] || null;
}

async function jsonFetch(worker, env, pathname, init = {}) {
  const headers = {
    "content-type": "application/json",
    ...(init.headers || {}),
  };
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

test("standalone email auth creates accounts, sessions and clears logout", async () => {
  const database = await migratedDatabase();
  const worker = await builtWorker();
  const objects = new Map();
  const env = {
    DB: new TestD1(database),
    BUCKET: {
      async put(key, _value, options = {}) {
        objects.set(key, {
          httpMetadata: options.httpMetadata || {},
          customMetadata: options.customMetadata || {},
        });
      },
      async head(key) {
        return objects.get(key) || null;
      },
      async get(key) {
        const meta = objects.get(key);
        if (!meta) return null;
        return {
          ...meta,
          body: { cancel: async () => {} },
        };
      },
      async delete(key) {
        objects.delete(key);
      },
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    UPLOAD_SIGNING_SECRET: "test-upload-signing-secret-standalone-auth",
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;
  globalThis.__ROAVLY_TEST_BUCKET__ = env.BUCKET;
  globalThis.__ROAVLY_TEST_UPLOAD_SECRET__ = env.UPLOAD_SIGNING_SECRET;
  globalThis.__ROAVLY_TEST_ENV__ = { ROAVLY_ALLOW_SITES_HEADERS: "0" };

  const signup = await jsonFetch(worker, env, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: "hiker@example.com",
      password: "trailready1",
      displayName: "Hiker One",
    }),
  });
  assert.equal(signup.response.status, 201, JSON.stringify(signup.body));
  assert.equal(signup.body.user.email, "hiker@example.com");
  const sessionCookie = cookieFromResponse(signup.response);
  assert.ok(sessionCookie, "signup should set roavly_session cookie");

  const accountRow = database
    .prepare("SELECT email, password_hash, password_salt FROM auth_accounts WHERE email = ?")
    .get("hiker@example.com");
  assert.ok(accountRow);
  assert.equal(accountRow.password_hash.length, 64);
  assert.equal(accountRow.password_salt.length, 32);

  const me = await jsonFetch(worker, env, "/api/me", {
    headers: { cookie: `roavly_session=${sessionCookie}` },
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.user.email, "hiker@example.com");
  assert.equal(me.body.profile.displayName, "Hiker One");

  const session = await jsonFetch(worker, env, "/api/auth/session", {
    headers: { cookie: `roavly_session=${sessionCookie}` },
  });
  assert.equal(session.response.status, 200);
  assert.equal(session.body.user.email, "hiker@example.com");

  const wrongPassword = await jsonFetch(worker, env, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "hiker@example.com",
      password: "wrong-password",
    }),
  });
  assert.equal(wrongPassword.response.status, 401);

  const sitesHeaderBlocked = await jsonFetch(worker, env, "/api/me", {
    headers: {
      "oai-authenticated-user-email": "spoof@example.com",
      "oai-authenticated-user-full-name": encodeURIComponent("Spoof"),
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.equal(sitesHeaderBlocked.body.user, null);

  const login = await jsonFetch(worker, env, "/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "hiker@example.com",
      password: "trailready1",
    }),
  });
  assert.equal(login.response.status, 200);
  const loginCookie = cookieFromResponse(login.response);
  assert.ok(loginCookie);

  const feed = await jsonFetch(worker, env, "/api/posts", {
    headers: { cookie: `roavly_session=${loginCookie}` },
  });
  assert.equal(feed.response.status, 200);
  assert.ok(Array.isArray(feed.body.posts));

  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x7f, 0xff, 0xd9,
  ]);
  const postId = crypto.randomUUID();
  const sign = await jsonFetch(worker, env, "/api/uploads/sign", {
    method: "POST",
    headers: { cookie: `roavly_session=${loginCookie}` },
    body: JSON.stringify({
      purpose: "post_photo",
      contentType: "image/jpeg",
      byteSize: jpeg.byteLength,
      postId,
    }),
  });
  assert.equal(sign.response.status, 200, JSON.stringify(sign.body));
  assert.equal(sign.body.key, `posts/${postId}.jpg`);

  const put = await worker.fetch(
    new Request(`http://localhost${sign.body.uploadUrl}`, {
      method: "PUT",
      headers: {
        cookie: `roavly_session=${loginCookie}`,
        "content-type": "image/jpeg",
        "content-length": String(jpeg.byteLength),
      },
      body: jpeg,
    }),
    env,
    runtimeContext(),
  );
  assert.equal(put.status, 201, await put.clone().text());

  const createPost = await jsonFetch(worker, env, "/api/posts", {
    method: "POST",
    headers: { cookie: `roavly_session=${loginCookie}` },
    body: JSON.stringify({
      postId,
      imageKey: sign.body.key,
      caption: "Standalone auth hike",
      activityType: "Hiking",
      location: "Grampians, Victoria",
      placeId: "test-place-standalone-auth",
      latitude: -37.14,
      longitude: 142.52,
      durationMinutes: 45,
      difficulty: "Moderate",
    }),
  });
  assert.equal(
    createPost.response.status,
    201,
    JSON.stringify(createPost.body),
  );

  const logout = await jsonFetch(worker, env, "/api/auth/logout", {
    method: "POST",
    headers: { cookie: `roavly_session=${loginCookie}` },
  });
  assert.equal(logout.response.status, 200);
  const cleared = cookieFromResponse(logout.response);
  assert.ok(!cleared || cleared === "");

  const afterLogout = await jsonFetch(worker, env, "/api/me", {
    headers: { cookie: `roavly_session=${loginCookie}` },
  });
  assert.equal(afterLogout.body.user, null);

  const duplicate = await jsonFetch(worker, env, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: "hiker@example.com",
      password: "trailready1",
    }),
  });
  assert.equal(duplicate.response.status, 409);
});

test("standalone auth source contracts replace ChatGPT Sites login", async () => {
  const root = new URL("../", import.meta.url);
  const read = (path) => readFile(new URL(path, root), "utf8");
  const auth = await read("app/chatgpt-auth.ts");
  const page = await read("app/page.tsx");
  const schema = await read("db/schema.ts");
  const migration = await read("drizzle/0012_standalone_auth.sql");
  const maps = await read("app/api/maps/config/route.ts");

  assert.match(schema, /authAccounts|auth_accounts/);
  assert.match(migration, /CREATE TABLE `auth_accounts`/);
  assert.match(auth, /roavly_session/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /ROAVLY_ALLOW_SITES_HEADERS/);
  assert.match(auth, /\/login/);
  assert.match(auth, /\/api\/auth\/logout/);
  assert.match(page, /\/api\/auth\/signup/);
  assert.match(page, /Create account/);
  assert.doesNotMatch(page, /Continue with ChatGPT/);
  assert.doesNotMatch(page, /signin-with-chatgpt/);
  assert.match(maps, /GOOGLE_MAPS_MAP_ID/);
  assert.match(maps, /DEMO_MAP_ID/);
});
