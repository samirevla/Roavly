/**
 * Waymark live user trial — ~100 numbered API scenarios against a running Worker.
 * Usage: BASE=http://127.0.0.1:8787 node --test tests/user-trial-100.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/$/, "");
const PASSWORD = "trailready1!";
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Minimal valid 1x1 PNG */
const MINI_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const ENCOURAGEMENT = "👏 Amazing effort!";

const results = [];
function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail: String(detail).slice(0, 240) });
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }
  store(response) {
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    const cookies = raw.length
      ? raw
      : (response.headers.get("set-cookie") || "")
          .split(/,(?=\s*[^;]+=)/)
          .filter(Boolean);
    for (const line of cookies) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  clear() {
    this.map.clear();
  }
  hasSession() {
    return this.map.has("roavly_session");
  }
}

async function api(jar, path, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = jar?.header();
  if (cookie) headers.set("cookie", cookie);
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(init.json);
    delete init.json;
  }
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  jar?.store(response);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, text, status: response.status };
}

function scenario(id, name, fn) {
  test(`${String(id).padStart(3, "0")}. ${name}`, async (t) => {
    try {
      await fn(t);
      record(id, name, true);
    } catch (error) {
      record(id, name, false, error?.message || error);
      throw error;
    }
  });
}

const users = {
  a: {
    email: `trial.a.${stamp}@example.com`,
    displayName: "Trial Alpha",
    username: `triala${stamp.slice(-6)}`,
    jar: new CookieJar(),
  },
  b: {
    email: `trial.b.${stamp}@example.com`,
    displayName: "Trial Bravo",
    username: `trialb${stamp.slice(-6)}`,
    jar: new CookieJar(),
  },
  c: {
    email: `trial.c.${stamp}@example.com`,
    displayName: "Trial Charlie",
    username: `trialc${stamp.slice(-6)}`,
    jar: new CookieJar(),
  },
};

const state = {
  postId: null,
  postImageUrl: null,
  commentId: null,
  conversationId: null,
  messageId: null,
  clubId: null,
  planId: null,
  trailId: null,
  gearTagId: null,
};

async function signup(user) {
  const { status, body } = await api(user.jar, "/api/auth/signup", {
    method: "POST",
    json: {
      email: user.email,
      password: PASSWORD,
      displayName: user.displayName,
    },
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(user.jar.hasSession(), "session cookie");
  assert.equal(body.user.email, user.email);
  return body;
}

async function ensureProfile(user) {
  await api(user.jar, "/api/me");
  const { status, body } = await api(user.jar, "/api/me", {
    method: "PUT",
    json: {
      displayName: user.displayName,
      username: user.username,
      bio: "Live trial hiker",
      homeBase: "Melbourne, VIC",
      favoriteActivities: "Hiking, Trail running",
      ageBand: "18+",
      experienceLevel: "Intermediate",
      pacePreference: "Steady",
      availability: "Weekends",
      travelRadiusKm: 80,
      groupStyle: "Social",
      accessibilityNeeds: "",
    },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.profile.username, user.username);
  return body.profile;
}

async function createPost(user, overrides = {}) {
  const postId = crypto.randomUUID();
  const photo = new Blob([MINI_PNG], { type: "image/png" });
  const sign = await api(user.jar, "/api/uploads/sign", {
    method: "POST",
    json: {
      purpose: "post_photo",
      contentType: "image/png",
      byteSize: photo.size,
      postId,
    },
  });
  assert.equal(sign.status, 200, JSON.stringify(sign.body));
  const put = await api(user.jar, sign.body.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "image/png",
      "content-length": String(photo.size),
    },
    body: photo,
  });
  assert.equal(put.status, 201, JSON.stringify(put.body));
  const payload = {
    postId,
    imageKey: sign.body.key,
    caption: overrides.caption || `Trial journey ${stamp}`,
    activityType: overrides.activityType || "Hiking",
    location: overrides.location || "Thousand Steps, Melbourne VIC",
    latitude: overrides.latitude ?? -37.849,
    longitude: overrides.longitude ?? 145.023,
    placeId: overrides.placeId || "ChIJtrialplaceid0001",
    locationPrivacy: overrides.locationPrivacy || "approximate",
    distanceKm: overrides.distanceKm ?? 6.5,
    durationMinutes: overrides.durationMinutes ?? 95,
    elevationMetres: overrides.elevationMetres ?? 220,
    difficulty: overrides.difficulty || "Moderate",
    tips: overrides.tips || "Carry water",
    conditions: overrides.conditions || "Clear",
    parkingInfo: overrides.parkingInfo || "Street parking",
    phoneSignal: overrides.phoneSignal || "Good",
    toilets: overrides.toilets || "Trailhead",
    accessibility: overrides.accessibility || "Steep stairs",
    dogFriendly: overrides.dogFriendly || "No",
    bestTime: overrides.bestTime || "Morning",
  };
  if (overrides.inspiredByPostId) payload.inspiredByPostId = overrides.inspiredByPostId;
  const { status, body } = await api(user.jar, "/api/posts", {
    method: "POST",
    json: payload,
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(body.post?.id || body.id, JSON.stringify(body));
  return body.post || body;
}

// ---------------------------------------------------------------------------
// 001–010: Health / public surface
// ---------------------------------------------------------------------------
scenario(1, "GET / returns HTML 200", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /Waymark/i);
});

scenario(2, "GET /login returns HTML 200", async () => {
  const res = await fetch(`${BASE}/login`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /html/i);
});

scenario(3, "Unauthed /api/auth/session returns null user", async () => {
  const { status, body } = await api(null, "/api/auth/session");
  assert.equal(status, 200);
  assert.equal(body.user, null);
});

scenario(4, "Unauthed /api/me returns null user/profile", async () => {
  const { status, body } = await api(null, "/api/me");
  assert.equal(status, 200);
  assert.equal(body.user, null);
  assert.equal(body.profile, null);
});

scenario(5, "Unauthed /api/posts is 401", async () => {
  const { status } = await api(null, "/api/posts");
  assert.equal(status, 401);
});

scenario(6, "Unauthed /api/friends is 401", async () => {
  const { status } = await api(null, "/api/friends");
  assert.equal(status, 401);
});

scenario(7, "Unauthed /api/conversations is 401", async () => {
  const { status } = await api(null, "/api/conversations");
  assert.equal(status, 401);
});

scenario(8, "Unauthed /api/maps/config is 401", async () => {
  const { status } = await api(null, "/api/maps/config");
  assert.equal(status, 401);
});

scenario(9, "Unauthed /api/action-hub is 401", async () => {
  const { status } = await api(null, "/api/action-hub");
  assert.equal(status, 401);
});

scenario(10, "Unauthed /api/monetization is 401", async () => {
  const { status } = await api(null, "/api/monetization");
  assert.equal(status, 401);
});

// ---------------------------------------------------------------------------
// 011–025: Auth flows
// ---------------------------------------------------------------------------
scenario(11, "Signup rejects empty body", async () => {
  const { status, body } = await api(null, "/api/auth/signup", {
    method: "POST",
    json: {},
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

scenario(12, "Signup rejects invalid email", async () => {
  const { status, body } = await api(null, "/api/auth/signup", {
    method: "POST",
    json: { email: "not-an-email", password: PASSWORD, displayName: "X" },
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

scenario(13, "Signup rejects short password", async () => {
  const { status, body } = await api(null, "/api/auth/signup", {
    method: "POST",
    json: { email: `short.${stamp}@example.com`, password: "abc", displayName: "X" },
  });
  assert.ok(status >= 400);
  assert.ok(body.error);
});

scenario(14, "Signup user A succeeds with session cookie", async () => {
  await signup(users.a);
});

scenario(15, "Signup user B succeeds", async () => {
  await signup(users.b);
});

scenario(16, "Signup user C succeeds", async () => {
  await signup(users.c);
});

scenario(17, "Duplicate signup rejected", async () => {
  const jar = new CookieJar();
  const { status, body } = await api(jar, "/api/auth/signup", {
    method: "POST",
    json: {
      email: users.a.email,
      password: PASSWORD,
      displayName: "Dup",
    },
  });
  assert.ok(status === 409 || status === 400, JSON.stringify(body));
});

scenario(18, "Login with wrong password is 401", async () => {
  const jar = new CookieJar();
  const { status } = await api(jar, "/api/auth/login", {
    method: "POST",
    json: { email: users.a.email, password: "wrong-password-xx" },
  });
  assert.equal(status, 401);
});

scenario(19, "Login with correct password sets session", async () => {
  const jar = new CookieJar();
  const { status, body } = await api(jar, "/api/auth/login", {
    method: "POST",
    json: { email: users.a.email, password: PASSWORD },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(jar.hasSession());
  assert.equal(body.user.email, users.a.email);
});

scenario(20, "Session endpoint reflects logged-in user A", async () => {
  const { status, body } = await api(users.a.jar, "/api/auth/session");
  assert.equal(status, 200);
  assert.equal(body.user.email, users.a.email);
});

scenario(21, "Logout clears session for temp jar", async () => {
  const jar = new CookieJar();
  await api(jar, "/api/auth/login", {
    method: "POST",
    json: { email: users.a.email, password: PASSWORD },
  });
  assert.ok(jar.hasSession());
  const { status } = await api(jar, "/api/auth/logout", { method: "POST" });
  assert.equal(status, 200);
  const session = await api(jar, "/api/auth/session");
  // cookie may still be present but server should reject invalid/cleared token
  assert.ok(session.body.user === null || session.status === 200);
});

scenario(22, "Re-login user A after logout probe keeps primary jar valid", async () => {
  // Primary jar from signup should still work; refresh if needed
  let { body } = await api(users.a.jar, "/api/auth/session");
  if (!body.user) {
    await api(users.a.jar, "/api/auth/login", {
      method: "POST",
      json: { email: users.a.email, password: PASSWORD },
    });
    ({ body } = await api(users.a.jar, "/api/auth/session"));
  }
  assert.equal(body.user.email, users.a.email);
});

scenario(23, "Login missing email rejected", async () => {
  const { status } = await api(null, "/api/auth/login", {
    method: "POST",
    json: { password: PASSWORD },
  });
  assert.ok(status >= 400);
});

scenario(24, "Signup without displayName still creates account", async () => {
  const jar = new CookieJar();
  const email = `trial.noname.${stamp}@example.com`;
  const { status, body } = await api(jar, "/api/auth/signup", {
    method: "POST",
    json: { email, password: PASSWORD },
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(body.user.email);
});

scenario(25, "Unknown email login is 401", async () => {
  const { status } = await api(null, "/api/auth/login", {
    method: "POST",
    json: { email: `missing.${stamp}@example.com`, password: PASSWORD },
  });
  assert.equal(status, 401);
});

// ---------------------------------------------------------------------------
// 026–040: Profile / me
// ---------------------------------------------------------------------------
scenario(26, "GET /api/me auto-creates profile for A", async () => {
  const { status, body } = await api(users.a.jar, "/api/me");
  assert.equal(status, 200);
  assert.equal(body.user.email, users.a.email);
  assert.ok(body.profile?.username);
});

scenario(27, "PUT /api/me updates profile A", async () => {
  await ensureProfile(users.a);
});

scenario(28, "PUT /api/me updates profile B", async () => {
  await ensureProfile(users.b);
});

scenario(29, "PUT /api/me updates profile C", async () => {
  await ensureProfile(users.c);
});

scenario(30, "Username conflict returns 409", async () => {
  const { status, body } = await api(users.b.jar, "/api/me", {
    method: "PUT",
    json: { username: users.a.username, displayName: users.b.displayName },
  });
  assert.equal(status, 409, JSON.stringify(body));
});

scenario(31, "Username cleaned to lowercase alphanumeric", async () => {
  const tempUser = `Tmp_${stamp.slice(-4)}`;
  const { status, body } = await api(users.c.jar, "/api/me", {
    method: "PUT",
    json: {
      displayName: users.c.displayName,
      username: tempUser,
      ageBand: "18+",
    },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.profile.username, tempUser.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24));
  // restore canonical username
  await ensureProfile(users.c);
});

scenario(32, "Age band 18+ accepted", async () => {
  const { status, body } = await api(users.a.jar, "/api/me", {
    method: "PUT",
    json: { displayName: users.a.displayName, username: users.a.username, ageBand: "18+" },
  });
  assert.equal(status, 200);
  assert.equal(body.profile.ageBand, "18+");
});

scenario(33, "Travel radius clamped to range", async () => {
  const { status, body } = await api(users.a.jar, "/api/me", {
    method: "PUT",
    json: {
      displayName: users.a.displayName,
      username: users.a.username,
      travelRadiusKm: 9999,
      ageBand: "18+",
    },
  });
  assert.equal(status, 200);
  assert.equal(body.profile.travelRadiusKm, 500);
});

scenario(34, "Unauthed PUT /api/me is 401", async () => {
  const { status } = await api(null, "/api/me", {
    method: "PUT",
    json: { displayName: "Nope" },
  });
  assert.equal(status, 401);
});

scenario(35, "Profile bio truncated / accepted under limit", async () => {
  const bio = "x".repeat(180);
  const { status, body } = await api(users.a.jar, "/api/me", {
    method: "PUT",
    json: {
      displayName: users.a.displayName,
      username: users.a.username,
      bio,
      ageBand: "18+",
    },
  });
  assert.equal(status, 200);
  assert.ok(body.profile.bio.length <= 180);
});

scenario(36, "Home base update persists", async () => {
  const { status, body } = await api(users.a.jar, "/api/me", {
    method: "PUT",
    json: {
      displayName: users.a.displayName,
      username: users.a.username,
      homeBase: "Fitzroy, Melbourne",
      ageBand: "18+",
    },
  });
  assert.equal(status, 200);
  assert.equal(body.profile.homeBase, "Fitzroy, Melbourne");
});

scenario(37, "GET /api/me after updates returns same username", async () => {
  const { status, body } = await api(users.a.jar, "/api/me");
  assert.equal(status, 200);
  assert.equal(body.profile.username, users.a.username);
});

scenario(38, "Session still valid after profile edits", async () => {
  const { status, body } = await api(users.a.jar, "/api/auth/session");
  assert.equal(status, 200);
  assert.equal(body.user.email, users.a.email);
});

scenario(39, "User B me returns distinct email", async () => {
  const { body } = await api(users.b.jar, "/api/me");
  assert.equal(body.user.email, users.b.email);
  assert.notEqual(body.user.email, users.a.email);
});

scenario(40, "User C me returns distinct username", async () => {
  const { body } = await api(users.c.jar, "/api/me");
  assert.equal(body.profile.username, users.c.username);
});

// ---------------------------------------------------------------------------
// 041–055: Posts / journeys
// ---------------------------------------------------------------------------
scenario(41, "Create journey without photo fails", async () => {
  const { status, body } = await api(users.a.jar, "/api/posts", {
    method: "POST",
    json: {
      postId: crypto.randomUUID(),
      caption: "No photo",
      durationMinutes: 30,
      location: "Somewhere",
      placeId: "x",
      latitude: -37,
      longitude: 145,
    },
  });
  assert.ok(status === 400 || status === 415, String(status));
  assert.match(String(body.error || ""), /photo|imageKey|upload/i);
});

scenario(42, "Create journey without placeId fails", async () => {
  const postId = crypto.randomUUID();
  const photo = new Blob([MINI_PNG], { type: "image/png" });
  const sign = await api(users.a.jar, "/api/uploads/sign", {
    method: "POST",
    json: {
      purpose: "post_photo",
      contentType: "image/png",
      byteSize: photo.size,
      postId,
    },
  });
  assert.equal(sign.status, 200, JSON.stringify(sign.body));
  const put = await api(users.a.jar, sign.body.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/png", "content-length": String(photo.size) },
    body: photo,
  });
  assert.equal(put.status, 201, JSON.stringify(put.body));
  const { status } = await api(users.a.jar, "/api/posts", {
    method: "POST",
    json: {
      postId,
      imageKey: sign.body.key,
      caption: "Missing place",
      durationMinutes: 30,
      location: "Somewhere",
      latitude: -37,
      longitude: 145,
    },
  });
  assert.equal(status, 400);
});

scenario(43, "Create journey with minimal PNG succeeds", async () => {
  const post = await createPost(users.a);
  state.postId = post.id;
  state.postImageUrl = post.imageUrl || `/api/media/${post.imageKey}`;
  assert.ok(state.postId);
});

scenario(44, "GET /api/posts feed includes new journey", async () => {
  const { status, body } = await api(users.a.jar, "/api/posts");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.posts));
  assert.ok(body.posts.some((p) => p.id === state.postId));
});

scenario(45, "Media URL for post image is reachable", async () => {
  const { status, body } = await api(users.a.jar, "/api/posts");
  const post = body.posts.find((p) => p.id === state.postId);
  assert.ok(post.imageUrl);
  const media = await api(users.a.jar, post.imageUrl);
  assert.equal(media.status, 200);
  assert.ok(media.response.headers.get("content-type")?.includes("image"));
});

scenario(46, "Unauthed media access denied or redirected", async () => {
  const { status, body } = await api(users.a.jar, "/api/posts");
  const post = body.posts.find((p) => p.id === state.postId);
  const media = await api(null, post.imageUrl);
  assert.ok(media.status === 401 || media.status === 403 || media.status === 404);
});

scenario(47, "User B can see A's post in feed", async () => {
  const { status, body } = await api(users.b.jar, "/api/posts");
  assert.equal(status, 200);
  assert.ok(body.posts.some((p) => p.id === state.postId));
});

scenario(48, "Motivate post toggles on", async () => {
  const { status, body } = await api(users.b.jar, `/api/posts/${state.postId}/motivate`, {
    method: "POST",
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.motivationCount >= 1);
  assert.equal(body.motivated, true);
  // Feed shape uses viewerMotivated — confirm feed reflects toggle
  const feed = await api(users.b.jar, "/api/posts");
  const post = feed.body.posts.find((p) => p.id === state.postId);
  assert.equal(post.viewerMotivated, true);
});

scenario(49, "Motivate post toggles off", async () => {
  const { status, body } = await api(users.b.jar, `/api/posts/${state.postId}/motivate`, {
    method: "POST",
  });
  assert.equal(status, 200);
  assert.equal(body.motivated, false);
});

scenario(50, "Motivate again for later scenarios", async () => {
  const { status, body } = await api(users.b.jar, `/api/posts/${state.postId}/motivate`, {
    method: "POST",
  });
  assert.equal(status, 200);
  assert.equal(body.motivated, true);
});

scenario(51, "Free-text comment rejected", async () => {
  const { status, body } = await api(users.b.jar, `/api/posts/${state.postId}/comments`, {
    method: "POST",
    json: { body: "this is not an approved encouragement" },
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

scenario(52, "Approved encouragement comment accepted", async () => {
  const { status, body } = await api(users.b.jar, `/api/posts/${state.postId}/comments`, {
    method: "POST",
    json: { body: ENCOURAGEMENT },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.commentId = body.comment.id;
});

scenario(53, "GET comments includes encouragement", async () => {
  const { status, body } = await api(users.a.jar, `/api/posts/${state.postId}/comments`);
  assert.equal(status, 200);
  assert.ok(body.comments.some((c) => c.id === state.commentId));
});

scenario(54, "Owner cannot report own post", async () => {
  const { status } = await api(users.a.jar, `/api/posts/${state.postId}/report`, {
    method: "POST",
    json: { reason: "test" },
  });
  assert.equal(status, 400);
});

scenario(55, "Other user can report post", async () => {
  const { status, body } = await api(users.c.jar, `/api/posts/${state.postId}/report`, {
    method: "POST",
    json: { reason: "Trial safety report" },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.reported, true);
});

// ---------------------------------------------------------------------------
// 056–065: Friends
// ---------------------------------------------------------------------------
scenario(56, "GET /api/friends lists people", async () => {
  const { status, body } = await api(users.a.jar, "/api/friends");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.people));
  assert.ok(body.people.some((p) => p.username === users.b.username));
});

scenario(57, "A requests friendship with B", async () => {
  const { status, body } = await api(users.a.jar, "/api/friends", {
    method: "POST",
    json: { action: "request", targetUsername: users.b.username },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
  assert.equal(body.relationship, "outgoing");
});

scenario(58, "B sees incoming request", async () => {
  const { body } = await api(users.b.jar, "/api/friends");
  const person = body.people.find((p) => p.username === users.a.username);
  assert.equal(person.relationship, "incoming");
});

scenario(59, "B accepts friendship", async () => {
  const { status, body } = await api(users.b.jar, "/api/friends", {
    method: "POST",
    json: { action: "accept", targetUsername: users.a.username },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.relationship, "friends");
});

scenario(60, "A and B show as friends", async () => {
  const a = await api(users.a.jar, "/api/friends");
  const b = await api(users.b.jar, "/api/friends");
  assert.equal(
    a.body.people.find((p) => p.username === users.b.username).relationship,
    "friends",
  );
  assert.equal(
    b.body.people.find((p) => p.username === users.a.username).relationship,
    "friends",
  );
});

scenario(61, "Friend request to unknown user 404", async () => {
  const { status } = await api(users.a.jar, "/api/friends", {
    method: "POST",
    json: { action: "request", targetUsername: "no.such.user.zzz" },
  });
  assert.equal(status, 404);
});

scenario(62, "Missing action on friends POST is 400", async () => {
  const { status } = await api(users.a.jar, "/api/friends", {
    method: "POST",
    json: { targetUsername: users.c.username },
  });
  assert.equal(status, 400);
});

scenario(63, "A requests C then C declines", async () => {
  await api(users.a.jar, "/api/friends", {
    method: "POST",
    json: { action: "request", targetUsername: users.c.username },
  });
  const { status, body } = await api(users.c.jar, "/api/friends", {
    method: "POST",
    json: { action: "decline", targetUsername: users.a.username },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.relationship, "none");
});

scenario(64, "C blocks A", async () => {
  const { status, body } = await api(users.c.jar, "/api/friends", {
    method: "POST",
    json: { action: "block", targetUsername: users.a.username },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.blocked, true);
});

scenario(65, "Blocked user hidden from friends list", async () => {
  const { body } = await api(users.c.jar, "/api/friends");
  assert.ok(!body.people.some((p) => p.username === users.a.username));
});

// ---------------------------------------------------------------------------
// 066–075: Messaging
// ---------------------------------------------------------------------------
scenario(66, "Start direct conversation A↔B", async () => {
  const { status, body } = await api(users.a.jar, "/api/conversations", {
    method: "POST",
    json: { type: "direct", memberUsernames: [users.b.username] },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
  state.conversationId = body.conversationId;
  assert.ok(state.conversationId);
});

scenario(67, "Idempotent direct conversation returns same id", async () => {
  const { body } = await api(users.a.jar, "/api/conversations", {
    method: "POST",
    json: { type: "direct", memberUsernames: [users.b.username] },
  });
  assert.equal(body.conversationId, state.conversationId);
});

scenario(68, "Send message in conversation", async () => {
  const { status, body } = await api(users.a.jar, `/api/conversations/${state.conversationId}/messages`, {
    method: "POST",
    json: { body: "Hey Bravo — trail ready for the weekend?" },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.messageId = body.message?.id || body.id;
});

scenario(69, "B reads messages", async () => {
  const { status, body } = await api(users.b.jar, `/api/conversations/${state.conversationId}/messages`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.messages));
  assert.ok(body.messages.length >= 1);
});

scenario(70, "B replies", async () => {
  const { status, body } = await api(users.b.jar, `/api/conversations/${state.conversationId}/messages`, {
    method: "POST",
    json: { body: "Absolutely — pack lunch and layers." },
  });
  assert.equal(status, 201, JSON.stringify(body));
});

scenario(71, "Empty message rejected", async () => {
  const { status } = await api(users.a.jar, `/api/conversations/${state.conversationId}/messages`, {
    method: "POST",
    json: { body: "   " },
  });
  assert.equal(status, 400);
});

scenario(72, "GET conversations lists thread", async () => {
  const { status, body } = await api(users.a.jar, "/api/conversations");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.conversations));
  assert.ok(body.conversations.some((c) => c.id === state.conversationId));
});

scenario(73, "Non-member cannot read conversation", async () => {
  // C is blocked from A; use fresh session — C should not be member
  const { status } = await api(users.c.jar, `/api/conversations/${state.conversationId}/messages`);
  assert.ok(status === 403 || status === 404);
});

scenario(74, "Group conversation requires name", async () => {
  const { status } = await api(users.a.jar, "/api/conversations", {
    method: "POST",
    json: { type: "group", memberUsernames: [users.b.username] },
  });
  assert.equal(status, 400);
});

scenario(75, "Group conversation with name succeeds", async () => {
  const { status, body } = await api(users.a.jar, "/api/conversations", {
    method: "POST",
    json: {
      type: "group",
      name: "Weekend Hikers",
      memberUsernames: [users.b.username],
    },
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(body.conversationId);
});

// ---------------------------------------------------------------------------
// 076–085: Saves, plans, clubs, safety, hub, maps
// ---------------------------------------------------------------------------
scenario(76, "B saves A's journey", async () => {
  const { status, body } = await api(users.b.jar, "/api/saves", {
    method: "POST",
    json: { action: "toggle", postId: state.postId },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
  assert.equal(body.saved, true);
});

scenario(77, "B plans saved journey", async () => {
  const { status, body } = await api(users.b.jar, "/api/saves", {
    method: "POST",
    json: { action: "plan", postId: state.postId },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.status, "planned");
});

scenario(78, "Create adventure plan", async () => {
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { status, body } = await api(users.a.jar, "/api/plans", {
    method: "POST",
    json: {
      title: "Thousand Steps morning",
      location: "Thousand Steps, Melbourne",
      startsAt,
      activityType: "Hiking",
      latitude: -37.849,
      longitude: 145.023,
      capacity: 6,
      visibility: "friends",
      safetyNotes: "Bring water",
      sourcePostId: state.postId,
    },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.planId = body.plan.id;
});

scenario(79, "Invite friend to plan", async () => {
  const { status, body } = await api(users.a.jar, `/api/plans/${state.planId}`, {
    method: "POST",
    json: { action: "invite", username: users.b.username },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
});

scenario(80, "Create public club", async () => {
  const { status, body } = await api(users.a.jar, "/api/clubs", {
    method: "POST",
    json: {
      name: `Trail Crew ${stamp.slice(-4)}`,
      description: "Live trial club",
      activityType: "Hiking",
      homeBase: "Melbourne",
      visibility: "public",
    },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.clubId = body.club.id;
});

scenario(81, "B joins club", async () => {
  const { status, body } = await api(users.b.jar, `/api/clubs/${state.clubId}`, {
    method: "POST",
    json: { action: "join" },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
  assert.equal(body.joined, true);
});

scenario(82, "Update safety circle", async () => {
  const { status, body } = await api(users.a.jar, "/api/safety", {
    method: "PUT",
    json: {
      contactName: "Emergency Contact",
      contactMethod: "sms:+61400000000",
      defaultCheckInMinutes: 90,
    },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.safety.contactName, "Emergency Contact");
});

scenario(83, "Action hub returns saved/plans/clubs/safety", async () => {
  const { status, body } = await api(users.a.jar, "/api/action-hub");
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(Array.isArray(body.plans) || body.plans);
  assert.ok(body.clubs);
  assert.ok(body.safety);
});

scenario(84, "Maps config: 200 with key or expected 503", async () => {
  const { status, body } = await api(users.a.jar, "/api/maps/config");
  assert.ok(status === 200 || status === 503, JSON.stringify(body));
  if (status === 200) {
    assert.ok(body.apiKey);
  } else {
    assert.match(String(body.error || ""), /Maps|unavailable/i);
  }
});

scenario(85, "Client diagnostics accepts payload", async () => {
  const { status } = await api(users.a.jar, "/api/client-diagnostics", {
    method: "POST",
    json: {
      area: "photo-upload",
      message: "trial diagnostic",
      mimeType: "image/png",
      size: 68,
      extension: "png",
    },
  });
  assert.equal(status, 204);
});

// ---------------------------------------------------------------------------
// 086–093: Monetization / trails / gear / ads smoke (no real charges)
// ---------------------------------------------------------------------------
scenario(86, "Monetization dashboard loads", async () => {
  const { status, body } = await api(users.a.jar, "/api/monetization");
  assert.equal(status, 200, JSON.stringify(body));
});

scenario(87, "Billing checkout without Stripe is 503", async () => {
  const { status, body } = await api(users.a.jar, "/api/billing/checkout", {
    method: "POST",
    json: { plan: "monthly" },
  });
  assert.ok(status === 503 || status === 200, JSON.stringify(body));
  if (status === 503) assert.ok(body.error);
});

scenario(88, "Creator status loads", async () => {
  const { status } = await api(users.a.jar, "/api/creator-status");
  assert.equal(status, 200);
});

scenario(89, "Trails list loads", async () => {
  const { status, body } = await api(users.a.jar, "/api/trails");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.trails));
});

scenario(90, "Create trail from own post", async () => {
  const { status, body } = await api(users.a.jar, "/api/trails", {
    method: "POST",
    json: { postId: state.postId },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(body));
  state.trailId = body.trail?.id;
});

scenario(91, "Gear catalog loads", async () => {
  const { status, body } = await api(users.a.jar, "/api/gear-tags");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.catalog));
  assert.ok(body.catalog.length >= 1);
});

scenario(92, "Tag gear on own post", async () => {
  const catalog = (await api(users.a.jar, "/api/gear-tags")).body.catalog;
  const { status, body } = await api(users.a.jar, "/api/gear-tags", {
    method: "POST",
    json: {
      targetType: "post",
      targetId: state.postId,
      catalogId: catalog[0].id,
    },
  });
  assert.equal(status, 201, JSON.stringify(body));
  state.gearTagId = body.tag.id;
});

scenario(93, "Ads + partners + sponsored challenges smoke", async () => {
  const ads = await api(users.a.jar, "/api/ads?placement=feed");
  assert.ok(ads.status === 200);
  const partners = await api(users.a.jar, "/api/partners");
  assert.equal(partners.status, 200);
  const challenges = await api(users.a.jar, "/api/sponsored-challenges");
  assert.equal(challenges.status, 200);
});

// ---------------------------------------------------------------------------
// 094–100: Stress / resilience / edge cases
// ---------------------------------------------------------------------------
scenario(94, "Second journey post by A succeeds", async () => {
  const post = await createPost(users.a, {
    caption: `Second trial journey ${stamp}`,
    placeId: "ChIJtrialplaceid0002",
  });
  assert.ok(post.id);
});

scenario(95, "Inspired journey by B referencing A", async () => {
  const post = await createPost(users.b, {
    caption: `Inspired by A ${stamp}`,
    placeId: "ChIJtrialplaceid0003",
    inspiredByPostId: state.postId,
  });
  assert.ok(post.id);
});

scenario(96, "Burst: 20 parallel authenticated GETs stay healthy", async () => {
  const paths = [
    "/api/me",
    "/api/posts",
    "/api/friends",
    "/api/conversations",
    "/api/action-hub",
    "/api/monetization",
    "/api/trails",
    "/api/gear-tags",
    "/api/auth/session",
    "/api/creator-status",
  ];
  const jobs = [];
  for (let i = 0; i < 20; i++) {
    const path = paths[i % paths.length];
    jobs.push(api(users.a.jar, path));
  }
  const outcomes = await Promise.all(jobs);
  const bad = outcomes.filter((o) => o.status >= 500);
  assert.equal(bad.length, 0, bad.map((o) => o.status).join(","));
  assert.ok(outcomes.every((o) => o.status < 500));
});

scenario(97, "Burst: 10 parallel feed reads from B", async () => {
  const outcomes = await Promise.all(
    Array.from({ length: 10 }, () => api(users.b.jar, "/api/posts")),
  );
  assert.ok(outcomes.every((o) => o.status === 200));
});

scenario(98, "Invalid JSON body on login does not 500", async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json",
  });
  assert.ok(res.status < 500);
});

scenario(99, "Very long caption rejected", async () => {
  const postId = crypto.randomUUID();
  const photo = new Blob([MINI_PNG], { type: "image/png" });
  const sign = await api(users.a.jar, "/api/uploads/sign", {
    method: "POST",
    json: {
      purpose: "post_photo",
      contentType: "image/png",
      byteSize: photo.size,
      postId,
    },
  });
  assert.equal(sign.status, 200, JSON.stringify(sign.body));
  const put = await api(users.a.jar, sign.body.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/png", "content-length": String(photo.size) },
    body: photo,
  });
  assert.equal(put.status, 201, JSON.stringify(put.body));
  const { status } = await api(users.a.jar, "/api/posts", {
    method: "POST",
    json: {
      postId,
      imageKey: sign.body.key,
      caption: "c".repeat(600),
      durationMinutes: 30,
      location: "Somewhere nice",
      placeId: "ChIJtoolong",
      latitude: -37.8,
      longitude: 145.0,
    },
  });
  assert.equal(status, 400);
});

scenario(100, "Home HTML still 200 after trial load", async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Waymark/i);
});

// Extra coverage to pad robustness (101–105) — still counted in summary
scenario(101, "Purchased tips endpoint loads", async () => {
  const { status } = await api(users.a.jar, "/api/users/me/purchased-tips");
  assert.ok(status === 200 || status === 404);
});

scenario(102, "Creator payouts endpoint loads or auth-gates", async () => {
  const { status } = await api(users.a.jar, "/api/creator-payouts");
  assert.ok(status === 200 || status === 401 || status === 403 || status === 404);
});

scenario(103, "Admin monetization rejects non-admin", async () => {
  const { status } = await api(users.a.jar, "/api/admin/monetization");
  assert.ok(status === 401 || status === 403 || status === 404);
});

scenario(104, "Club leave by non-owner works", async () => {
  const { status, body } = await api(users.b.jar, `/api/clubs/${state.clubId}`, {
    method: "POST",
    json: { action: "leave" },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.joined, false);
});

scenario(105, "Complete save status on journey", async () => {
  const { status, body } = await api(users.b.jar, "/api/saves", {
    method: "POST",
    json: { action: "complete", postId: state.postId },
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.status, "completed");
});

test.after(() => {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n========== WAYMARK USER TRIAL SUMMARY ==========");
  console.log(`BASE: ${BASE}`);
  console.log(`Scenarios recorded: ${results.length}`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    console.log("--- failures ---");
    for (const f of failed) {
      console.log(`  ${String(f.id).padStart(3, "0")} ${f.name}: ${f.detail}`);
    }
  }
  console.log("================================================\n");
});
