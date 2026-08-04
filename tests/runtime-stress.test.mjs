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

function authHeaders(email, name) {
  return {
    "content-type": "application/json",
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

async function request(worker, env, email, name, pathname, init = {}) {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      ...init,
      headers: { ...authHeaders(email, name), ...init.headers },
    }),
    env,
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function bearerRequest(worker, env, token, pathname, init = {}) {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    }),
    env,
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function jsonBody(value) {
  return { body: JSON.stringify(value) };
}

function seedSocialGraph(database) {
  const seconds = Math.floor(Date.now() / 1000);
  const people = [
    ["alex@example.com", "Alex Ridge", "alex.ridge"],
    ["blair@example.com", "Blair Summit", "blair.summit"],
    ["casey@example.com", "Casey Trail", "casey.trail"],
    ["devon@example.com", "Devon Outside", "devon.outside"],
  ];
  const insertProfile = database.prepare(`
    INSERT INTO profiles (
      email, display_name, username, bio, home_base, favorite_activities,
      created_at, updated_at
    ) VALUES (?, ?, ?, '', '', '', ?, ?)
  `);
  for (const [email, displayName, username] of people) {
    insertProfile.run(email, displayName, username, seconds, seconds);
  }
  const insertFriendship = database.prepare(`
    INSERT INTO friendships (
      id, user_one_email, user_two_email, requested_by_email, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'accepted', ?, ?)
  `);
  for (const [first, second] of [
    ["alex@example.com", "blair@example.com"],
    ["alex@example.com", "casey@example.com"],
  ]) {
    const [userOne, userTwo] = [first, second].sort();
    insertFriendship.run(
      crypto.randomUUID(),
      userOne,
      userTwo,
      first,
      seconds,
      seconds,
    );
  }
  database.prepare(`
    INSERT INTO posts (
      id, author_email, author_name, caption, activity_type, location,
      duration_minutes, image_key, created_at
    ) VALUES ('post-alex', 'alex@example.com', 'Alex Ridge', 'A real test hike',
      'Hiking', 'Grampians, Victoria', 90, 'posts/test.jpg', ?)
  `).run(seconds);
}

test("comment permissions and messaging remain correct under realistic bursts", async () => {
  const database = await migratedDatabase();
  seedSocialGraph(database);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("stress", `${process.pid}-${Date.now()}-${Math.random()}`);
  const worker = (await import(workerUrl.href)).default;
  const env = {
    DB: new TestD1(database),
    BUCKET: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    },
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  globalThis.__ROAVLY_TEST_DB__ = env.DB;

  const mobileComplete = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    "/api/mobile/auth/complete",
  );
  assert.equal(mobileComplete.status, 302);
  const callback = mobileComplete.headers.get("location");
  assert.match(callback, /^roavly:\/\/auth\?code=/);
  const mobileCode = new URL(callback).searchParams.get("code");
  const exchangeResponse = await worker.fetch(
    new Request("http://localhost/api/mobile/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: mobileCode }),
    }),
    env,
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  assert.equal(exchangeResponse.status, 200);
  const mobileToken = (await exchangeResponse.json()).token;
  assert.match(mobileToken, /^[A-Za-z0-9_-]{48,200}$/);

  const mobileMe = await bearerRequest(worker, env, mobileToken, "/api/me");
  assert.equal(mobileMe.status, 200);
  assert.equal((await mobileMe.json()).user.email, "alex@example.com");

  const replayExchange = await worker.fetch(
    new Request("http://localhost/api/mobile/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: mobileCode }),
    }),
    env,
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  assert.equal(replayExchange.status, 401);

  const encouragementResponse = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/posts/post-alex/comments",
    { method: "POST", ...jsonBody({ body: "💚 You motivated me!" }) },
  );
  assert.equal(encouragementResponse.status, 201);
  const encouragement = (await encouragementResponse.json()).comment;
  assert.equal(encouragement.canDelete, true);
  const ownerComments = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    "/api/posts/post-alex/comments",
  );
  assert.equal((await ownerComments.json()).comments[0].canDelete, true);
  const outsiderComments = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    "/api/posts/post-alex/comments",
  );
  assert.equal((await outsiderComments.json()).comments[0].canDelete, false);

  const negativeComment = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    "/api/posts/post-alex/comments",
    { method: "POST", ...jsonBody({ body: "you suck" }) },
  );
  assert.equal(negativeComment.status, 400);

  const outsiderDelete = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    `/api/posts/post-alex/comments/${encouragement.id}`,
    { method: "DELETE" },
  );
  assert.equal(outsiderDelete.status, 403);

  const ownerDelete = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/posts/post-alex/comments/${encouragement.id}`,
    { method: "DELETE" },
  );
  assert.equal(ownerDelete.status, 200);

  const ownCommentResponse = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/posts/post-alex/comments",
    { method: "POST", ...jsonBody({ body: "🙌 Love this journey!" }) },
  );
  const ownComment = (await ownCommentResponse.json()).comment;
  const ownDelete = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    `/api/posts/post-alex/comments/${ownComment.id}`,
    { method: "DELETE" },
  );
  assert.equal(ownDelete.status, 200);

  const directCreationBurst = await Promise.all(
    Array.from({ length: 20 }, () =>
      request(
        worker,
        env,
        "alex@example.com",
        "Alex Ridge",
        "/api/conversations",
        {
          method: "POST",
          ...jsonBody({
            type: "direct",
            memberUsernames: ["blair.summit"],
          }),
        },
      ),
    ),
  );
  assert.ok(directCreationBurst.every((response) => [200, 201].includes(response.status)));
  const directIds = await Promise.all(
    directCreationBurst.map(async (response) => (await response.json()).conversationId),
  );
  assert.equal(new Set(directIds).size, 1);
  const directId = directIds[0];

  const directBurst = await Promise.all(
    Array.from({ length: 75 }, (_, index) =>
      request(
        worker,
        env,
        "alex@example.com",
        "Alex Ridge",
        `/api/conversations/${directId}/messages`,
        {
          method: "POST",
          ...jsonBody({ body: `Direct planning message ${index + 1}` }),
        },
      ),
    ),
  );
  assert.equal(directBurst.filter((response) => response.status === 201).length, 75);
  const directMessagesResponse = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    `/api/conversations/${directId}/messages`,
  );
  assert.equal(directMessagesResponse.status, 200);
  assert.equal((await directMessagesResponse.json()).messages.length, 75);
  const oversizedMessage = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/conversations/${directId}/messages`,
    {
      method: "POST",
      ...jsonBody({ body: "x".repeat(1001) }),
    },
  );
  assert.equal(oversizedMessage.status, 400);

  const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const journeyResponse = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    "/api/conversations",
    {
      method: "POST",
      ...jsonBody({
        type: "group",
        purpose: "journey",
        name: "Journey Together: Grampians",
        memberUsernames: ["blair.summit", "casey.trail"],
        activityType: "Hiking",
        startsAt,
        location: "Halls Gap, Victoria",
        planNotes: "Bring water and a waterproof layer.",
      }),
    },
  );
  assert.equal(journeyResponse.status, 201);
  const journeyId = (await journeyResponse.json()).conversationId;

  const summaryResponse = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    "/api/conversations",
  );
  const summaryPayload = await summaryResponse.json();
  const journeySummary = summaryPayload.conversations.find(
    (conversation) => conversation.id === journeyId,
  );
  assert.equal(journeySummary.purpose, "journey");
  assert.equal(journeySummary.members.length, 3);
  assert.equal(journeySummary.location, "Halls Gap, Victoria");

  const updateResponse = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    `/api/conversations/${journeyId}`,
    {
      method: "PUT",
      ...jsonBody({
        name: "Journey Together: Grampians",
        activityType: "Hiking",
        startsAt,
        location: "Halls Gap Visitor Centre",
        planNotes: "Meet at 7am. Bring water, breakfast and a waterproof layer.",
      }),
    },
  );
  assert.equal(updateResponse.status, 200);
  const outsiderUpdate = await request(
    worker,
    env,
    "devon@example.com",
    "Devon Outside",
    `/api/conversations/${journeyId}`,
    {
      method: "PUT",
      ...jsonBody({
        name: "Changed by outsider",
        activityType: "Hiking",
        startsAt,
        location: "Somewhere else",
        planNotes: "",
      }),
    },
  );
  assert.equal(outsiderUpdate.status, 403);

  for (const [email, name, prefix] of [
    ["alex@example.com", "Alex Ridge", "Alex"],
    ["blair@example.com", "Blair Summit", "Blair"],
  ]) {
    const burst = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        request(
          worker,
          env,
          email,
          name,
          `/api/conversations/${journeyId}/messages`,
          {
            method: "POST",
            ...jsonBody({ body: `${prefix} group message ${index + 1}` }),
          },
        ),
      ),
    );
    assert.equal(burst.filter((response) => response.status === 201).length, 30);
  }

  const unreadResponse = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    "/api/conversations",
  );
  const unreadJourney = (await unreadResponse.json()).conversations.find(
    (conversation) => conversation.id === journeyId,
  );
  assert.equal(unreadJourney.unreadCount, 60);

  const groupMessagesResponse = await request(
    worker,
    env,
    "casey@example.com",
    "Casey Trail",
    `/api/conversations/${journeyId}/messages`,
  );
  assert.equal(groupMessagesResponse.status, 200);
  assert.equal((await groupMessagesResponse.json()).messages.length, 60);

  const outsiderRead = await request(
    worker,
    env,
    "devon@example.com",
    "Devon Outside",
    `/api/conversations/${journeyId}/messages`,
  );
  assert.equal(outsiderRead.status, 403);

  const scheduledStart = new Date(Date.now() + 2 * 86400000).toISOString();
  const planCreation = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    "/api/plans",
    {
      method: "POST",
      ...jsonBody({
        title: "Sunday summit crew",
        activityType: "Hiking",
        startsAt: scheduledStart,
        location: "Mount Macedon, Victoria",
        experienceLevel: "All levels",
        pace: "Flexible",
        capacity: 6,
        visibility: "friends",
      }),
    },
  );
  assert.equal(planCreation.status, 201);
  const planId = (await planCreation.json()).plan.id;

  const earlyCheckIn = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/plans/${planId}`,
    { method: "POST", ...jsonBody({ action: "checkin" }) },
  );
  assert.equal(earlyCheckIn.status, 409);

  const journeyChatCreation = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/plans/${planId}`,
    { method: "POST", ...jsonBody({ action: "create_chat" }) },
  );
  assert.equal(journeyChatCreation.status, 201);
  const planConversationId = (await journeyChatCreation.json()).conversationId;

  const invitation = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/plans/${planId}`,
    {
      method: "POST",
      ...jsonBody({ action: "invite", username: "blair.summit" }),
    },
  );
  assert.equal(invitation.status, 201);

  const invitedHubResponse = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/action-hub",
  );
  const invitedPlan = (await invitedHubResponse.json()).plans.find(
    (plan) => plan.id === planId,
  );
  assert.equal(invitedPlan.viewerStatus, "invited");

  const acceptInvitation = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    `/api/plans/${planId}`,
    { method: "POST", ...jsonBody({ action: "accept_invite" }) },
  );
  assert.equal(acceptInvitation.status, 200);

  const invitedConversations = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/conversations",
  );
  assert.ok(
    (await invitedConversations.json()).conversations.some(
      (conversation) => conversation.id === planConversationId,
    ),
  );

  const startJourney = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/plans/${planId}`,
    { method: "POST", ...jsonBody({ action: "start" }) },
  );
  assert.equal(startJourney.status, 200);

  for (const action of ["checkin", "safe"]) {
    const safetyResponse = await request(
      worker,
      env,
      "blair@example.com",
      "Blair Summit",
      `/api/plans/${planId}`,
      { method: "POST", ...jsonBody({ action }) },
    );
    assert.equal(safetyResponse.status, 200, action);
  }

  const completeJourney = await request(
    worker,
    env,
    "alex@example.com",
    "Alex Ridge",
    `/api/plans/${planId}`,
    { method: "POST", ...jsonBody({ action: "complete" }) },
  );
  assert.equal(completeJourney.status, 200);
  const completionPayload = await completeJourney.json();
  const chatLifetime =
    new Date(completionPayload.chatExpiresAt).getTime() -
    new Date(completionPayload.completedAt).getTime();
  assert.equal(chatLifetime, 48 * 60 * 60 * 1000);

  const windingDownChats = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/conversations",
  );
  assert.ok(
    (await windingDownChats.json()).conversations.some(
      (conversation) =>
        conversation.id === planConversationId && conversation.expiresAt,
    ),
  );

  database
    .prepare("UPDATE conversations SET expires_at = ? WHERE id = ?")
    .run(Date.now() - 1000, planConversationId);
  const expiredChats = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    "/api/conversations",
  );
  assert.ok(
    !(await expiredChats.json()).conversations.some(
      (conversation) => conversation.id === planConversationId,
    ),
  );
  const expiredMessage = await request(
    worker,
    env,
    "blair@example.com",
    "Blair Summit",
    `/api/conversations/${planConversationId}/messages`,
    { method: "POST", ...jsonBody({ body: "Too late" }) },
  );
  assert.equal(expiredMessage.status, 410);

  const mobileLogout = await bearerRequest(
    worker,
    env,
    mobileToken,
    "/api/mobile/auth/logout",
    { method: "POST" },
  );
  assert.equal(mobileLogout.status, 200);
  const signedOutMe = await bearerRequest(worker, env, mobileToken, "/api/me");
  assert.equal(signedOutMe.status, 200);
  assert.equal((await signedOutMe.json()).user, null);

  database.close();
  delete globalThis.__ROAVLY_TEST_DB__;
});
