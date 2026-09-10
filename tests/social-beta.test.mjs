import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const runtimeEnv = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const runtimeContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("the production manifest enables durable database and photo storage", async () => {
  const manifest = JSON.parse(await source(".openai/hosting.json"));
  assert.equal(manifest.d1, "DB");
  assert.equal(manifest.r2, "BUCKET");
});

test("the approved Waymark identity and Kinetic Trail social system are production assets", async () => {
  const page = await source("app/page.tsx");
  const logo = await source("app/components/waymark-logo.tsx");
  const favicon = await source("public/favicon.svg");
  const styles = await source("app/globals.css");
  assert.match(page, /desktop-topbar/);
  assert.match(page, /<WaymarkLogo/);
  assert.match(logo, /waymark-logo-tile/);
  assert.match(logo, /Waymark/);
  assert.match(favicon, /#0F3D2E/);
  assert.match(favicon, /#196048/);
  assert.match(favicon, /#A7F3D0/);
  assert.match(styles, /Kinetic Trail/);
  assert.match(styles, /--signal: #f1783d/);
  assert.match(styles, /\.post-actions \.motivate-button/);
  assert.match(styles, /grid-template-columns: minmax\(0, 890px\)/);
});

test("the public beta contains no seeded people, posts, challenges, clubs or stock-photo picker", async () => {
  const page = await source("app/page.tsx");
  const postsApi = await source("app/api/posts/route.ts");
  const combined = `${page}\n${postsApi}`;
  for (const demoTerm of [
    "Maya Chen",
    "seedPost",
    "The Pinnacle Walk",
    "MacKenzie Falls",
    "Melbourne Weekend Hikers",
    "Trail Blazer",
    "Choose a trial photo",
  ]) {
    assert.doesNotMatch(combined, new RegExp(demoTerm, "i"));
  }
  assert.match(page, /Your next adventure starts here/);
});

test("real photo uploads are required and constrained on both client and server", async () => {
  const page = await source("app/page.tsx");
  const postsApi = await source("app/api/posts/route.ts");
  const photoUpload = await source("app/photo-upload.ts");
  const clientPhoto = await source("app/client-photo.ts");
  const uploadImplementation = `${postsApi}\n${photoUpload}`;
  assert.match(page, /type="file"/);
  assert.match(page, /accept="image\/\*,\.heic,\.heif/);
  assert.match(page, /converted and resized automatically/);
  assert.match(clientPhoto, /canvas-heic-to-jpeg/);
  assert.ok(
    clientPhoto.indexOf("converter.convertToFile") < clientPhoto.indexOf('import("heic2any")'),
    "iPhone-native HEIC conversion should run before the legacy fallback",
  );
  assert.match(clientPhoto, /PHOTO_PREPARATION_TIMEOUT_MS/);
  assert.match(clientPhoto, /new FileReader\(\)/);
  assert.match(page, /<img className="photo-preview"/);
  assert.match(clientPhoto, /heic2any/);
  assert.match(clientPhoto, /30 \* 1024 \* 1024/);
  assert.match(clientPhoto, /TARGET_UPLOAD_BYTES = 850 \* 1024/);
  assert.match(clientPhoto, /MAX_IMAGE_EDGE = 1600/);
  assert.match(clientPhoto, /maxEdge: 480, quality: \.35/);
  assert.match(photoUpload, /8 \* 1024 \* 1024/);
  assert.match(photoUpload, /expected pattern/);
  assert.doesNotMatch(photoUpload, /Try a JPG, PNG or WebP under 8 MB/);
  assert.match(postsApi, /Choose a photo for your journey/);
  assert.match(uploadImplementation, /image\/jpeg/);
  assert.match(uploadImplementation, /image\/png/);
  assert.match(uploadImplementation, /image\/webp/);
  assert.match(postsApi, /photoExtension\(contentType\)/);
  assert.match(page, /Upload needs attention/);
  assert.match(page, /Still needed/);
  assert.match(clientPhoto, /api\/client-diagnostics/);
  assert.match(page, /reportPhotoUploadFailure/);
  assert.match(page, /X-Roavly-Photo-Bytes/);
});

test("choosing a Google location preserves the completed journey form", async () => {
  const page = await source("app/page.tsx");
  const picker = await source("app/components/google-location-picker.tsx");
  const styles = await source("app/globals.css");
  assert.match(page, /onSelect=\{\(place\) => setDraft\(\(current\) => \(\{/);
  assert.match(page, /\.\.\.current/);
  assert.match(picker, /const onSelectRef = useRef\(onSelect\)/);
  assert.match(picker, /onSelectRef\.current\(\{/);
  assert.match(picker, /AutocompleteSuggestion\.fetchAutocompleteSuggestions/);
  assert.match(picker, /location-suggestions/);
  assert.match(styles, /\.location-suggestions/);
  assert.match(styles, /In-page location suggestions/);
});

test("social routes enforce sign-in before exposing feed, friends, maps or media", async () => {
  const worker = await builtWorker();
  for (const pathname of ["/api/posts", "/api/friends", "/api/conversations", "/api/conversations/example/messages", "/api/maps/config", "/api/media/posts/example", "/api/action-hub"]) {
    const response = await worker.fetch(
      new Request(`http://localhost${pathname}`),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 401, pathname);
  }
  const saveResponse = await worker.fetch(
    new Request("http://localhost/api/saves", { method: "POST", body: "{}" }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(saveResponse.status, 401);
  const diagnosticResponse = await worker.fetch(
    new Request("http://localhost/api/client-diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(diagnosticResponse.status, 401);
});

test("inspiration can become a saved, planned and completed real-world adventure", async () => {
  const schema = await source("db/schema.ts");
  const postsApi = await source("app/api/posts/route.ts");
  const savesApi = await source("app/api/saves/route.ts");
  const hubApi = await source("app/api/action-hub/route.ts");
  const discover = await source("app/components/discover-view.tsx");

  for (const table of ["saved_journeys", "adventure_plans", "plan_members"]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(schema, /inspiredByPostId/);
  assert.match(postsApi, /inspiredMinutes/);
  assert.match(postsApi, /status: "completed"/);
  assert.match(savesApi, /nextStatus = payload\.action === "complete" \? "completed" : "planned"/);
  assert.match(hubApi, /attendeeCount/);
  assert.match(discover, /Find it\. Plan it\. Get outside\./);
  assert.match(discover, /Motivation Chain/);
  assert.match(discover, /Ask to join/);
  assert.match(discover, /I’m safe/);
});

test("public discovery protects precise locations and minors by default", async () => {
  const schema = await source("db/schema.ts");
  const postsApi = await source("app/api/posts/route.ts");
  const page = await source("app/page.tsx");

  assert.match(schema, /locationPrivacy/);
  assert.match(schema, /ageBand/);
  assert.match(postsApi, /Math\.round\(post\.latitude \* 100\) \/ 100/);
  assert.match(postsApi, /profile\?\.ageBand === "18\+"/);
  assert.match(postsApi, /placeId: canSeeExact \? post\.placeId : null/);
  assert.match(page, /Approximate area for everyone/);
  assert.match(page, /Precise sharing is only available to profiles confirmed as 18\+/);
});

test("clubs, compatibility, safety circles and personal challenges are durable", async () => {
  const schema = await source("db/schema.ts");
  const hubApi = await source("app/api/action-hub/route.ts");
  const discover = await source("app/components/discover-view.tsx");
  const friendsApi = await source("app/api/friends/route.ts");

  for (const table of ["clubs", "club_members", "safety_profiles", "blocks"]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  for (const field of ["experienceLevel", "pacePreference", "availability", "travelRadiusKm", "groupStyle", "accessibilityNeeds"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(hubApi, /10 Hours Outside/);
  assert.match(discover, /No leaderboards/);
  assert.match(discover, /OUTDOOR PASSPORT/);
  assert.match(discover, /Automated SMS alerts are not enabled yet/);
  assert.match(friendsApi, /payload\.action === "block"/);
});

test("activity import, useful spot details and shareable recaps are real client features", async () => {
  const schema = await source("db/schema.ts");
  const page = await source("app/page.tsx");

  for (const field of ["difficulty", "tips", "conditions", "parkingInfo", "phoneSignal", "toilets", "accessibility", "dogFriendly", "bestTime"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(page, /accept="\.gpx,application\/gpx\+xml"/);
  assert.match(page, /haversineKm/);
  assert.match(page, /Know before you go/);
  assert.match(page, /createJourneyRecap/);
  assert.match(page, /canvas\.toBlob/);
});

test("private friend and group messaging is durable and membership-gated", async () => {
  const schema = await source("db/schema.ts");
  const conversationsApi = await source("app/api/conversations/route.ts");
  const messagesApi = await source("app/api/conversations/[id]/messages/route.ts");
  const conversationApi = await source("app/api/conversations/[id]/route.ts");
  const messagesUi = await source("app/components/messages-view.tsx");

  for (const table of ["conversations", "conversation_members", "chat_messages"]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(schema, /conversation_member_idx/);
  assert.match(schema, /lastReadAt/);
  assert.match(conversationsApi, /You can only start conversations with accepted friends/);
  assert.match(conversationsApi, /usernames\.length > 19/);
  assert.match(messagesApi, /You are not a member of this conversation/);
  assert.match(messagesApi, /You can only send direct messages to accepted friends/);
  assert.match(messagesApi, /body\.length > 1000/);
  assert.match(conversationsApi, /purpose === "journey"/);
  assert.match(conversationApi, /Only group members can update this journey plan/);
  assert.match(messagesUi, /Journey Together chat created/);
  assert.match(messagesUi, /Create Journey Together/);
  assert.match(messagesUi, /Save for everyone/);
  assert.match(messagesUi, /unreadCount/);
  assert.doesNotMatch(messagesUi, /Maya Chen|seedMessage|fake conversation/i);
});

test("scheduled journeys unlock safety only after start and close linked chats after 48 hours", async () => {
  const schema = await source("db/schema.ts");
  const planApi = await source("app/api/plans/[id]/route.ts");
  const hubApi = await source("app/api/action-hub/route.ts");
  const conversationsApi = await source("app/api/conversations/route.ts");
  const messagesApi = await source("app/api/conversations/[id]/messages/route.ts");
  const discover = await source("app/components/discover-view.tsx");

  for (const field of ["startedAt", "completedAt", "adventurePlanId", "expiresAt"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(planApi, /48 \* 60 \* 60 \* 1000/);
  assert.match(planApi, /payload\.action === "invite"/);
  assert.match(planApi, /payload\.action === "create_chat"/);
  assert.match(planApi, /Safety check-ins become available when the journey starts/);
  assert.match(hubApi, /autoStartingPlans/);
  assert.match(conversationsApi, /conversation\.expiresAt/);
  assert.match(messagesApi, /closed 48 hours after the journey ended/);
  assert.match(discover, /Start journey/);
  assert.match(discover, /Invite friends/);
  assert.match(discover, /Open journey chat/);
});

test("the native iPhone beta uses one-time sign-in and the same social APIs", async () => {
  const schema = await source("db/schema.ts");
  const auth = await source("app/chatgpt-auth.ts");
  const complete = await source("app/api/mobile/auth/complete/route.ts");
  const exchange = await source("app/api/mobile/auth/exchange/route.ts");
  const mobileApp = await source("mobile/App.tsx");
  const mobileApi = await source("mobile/src/api.ts");
  const composer = await source("mobile/src/screens/ComposerModal.tsx");
  const messages = await source("mobile/src/screens/MessagesScreen.tsx");
  const postCard = await source("mobile/src/components/PostCard.tsx");

  for (const table of ["mobile_auth_codes", "mobile_auth_sessions"]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(auth, /authorization/);
  assert.match(auth, /SHA-256/);
  assert.match(complete, /roavly:\/\/auth\?code=/);
  assert.match(exchange, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(mobileApi, /expo-secure-store/);
  assert.match(mobileApi, /\/api\/mobile\/auth\/exchange/);
  assert.match(mobileApp, /FeedScreen/);
  assert.match(mobileApp, /MapScreen/);
  assert.match(mobileApp, /FriendsScreen/);
  assert.match(mobileApp, /MessagesScreen/);
  assert.match(composer, /expo-image-manipulator/);
  assert.match(composer, /roavlyApi\.places/);
  assert.match(messages, /Journey Together/);
  assert.match(messages, /Save for everyone/);
  assert.match(postCard, /deleteComment/);
  assert.match(postCard, /I’m motivated/);
});

test("Google Maps configuration stays out of source and is delivered only to signed-in clients", async () => {
  const configApi = await source("app/api/maps/config/route.ts");
  const loader = await source("app/google-maps.ts");
  const manifest = await source(".openai/hosting.json");
  assert.match(configApi, /getChatGPTUser/);
  assert.match(configApi, /GOOGLE_MAPS_API_KEY/);
  assert.match(configApi, /DEMO_MAP_ID/);
  assert.match(configApi, /cache-control/);
  assert.match(loader, /\/api\/maps\/config/);
  assert.doesNotMatch(`${configApi}\n${loader}\n${manifest}`, /AIza[0-9A-Za-z_-]{20,}/);
});

test("the web app has one authoritative iPhone layout with safe areas and keyboard-safe forms", async () => {
  const layout = await source("app/layout.tsx");
  const css = await source("app/globals.css");

  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(layout, /width:\s*"device-width"/);
  assert.match(css, /Authoritative iPhone layout/);
  assert.match(css, /min-height:\s*100dvh/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /font-size:\s*16px !important/);
  assert.match(css, /height:\s*calc\(100dvh - 120px/);
  assert.match(css, /gmp-place-autocomplete/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /Mobile Fit Guard/);
  assert.match(css, /max-width:\s*100% !important/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.google-autocomplete-host\s*\{[^}]*flex:\s*1 1 0/s);
  assert.match(css, /\.modal-backdrop\s*\{[^}]*height:\s*100dvh/s);
});

test("the premium social redesign stays real-data driven and preserves every core route", async () => {
  const page = await source("app/page.tsx");
  const discover = await source("app/components/discover-view.tsx");
  const explore = await source("app/components/explore-map.tsx");
  const messages = await source("app/components/messages-view.tsx");
  const css = await source("app/globals.css");

  for (const tab of ["Home", "Explore", "Create", "Journeys", "Profile"]) {
    assert.match(`${page}\n${css}`, new RegExp(tab));
  }
  assert.match(page, /Today’s Adventures/);
  assert.match(page, /Community pulse/);
  assert.match(page, /post-media/);
  assert.match(page, /Adventure passport/i);
  assert.match(explore, /visual-discovery/);
  assert.match(explore, /filteredPosts\.slice/);
  assert.match(discover, /Journey Together/);
  assert.match(messages, /Itinerary & packing notes/);
  assert.match(css, /Waymark Expedition/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(`${page}\n${explore}`, /Billy completed|Sarah inspired|James started|Amanda uploaded|Alex completed/);
});

test("journey photos open in an accessible touch zoom and pan viewer", async () => {
  const page = await source("app/page.tsx");
  const css = await source("app/globals.css");
  assert.match(page, /function ImageLightbox/);
  assert.match(page, /onPointerDown=\{handlePointerDown\}/);
  assert.match(page, /onPointerMove=\{handlePointerMove\}/);
  assert.match(page, /onWheel=\{handleWheel\}/);
  assert.match(page, /onDoubleClick=/);
  assert.match(page, /Math\.min\(5, Math\.max\(1/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
  assert.match(page, /Pinch to zoom · drag to move/);
  assert.match(css, /\.image-lightbox-stage\s*\{[^}]*touch-action:\s*none/s);
  assert.match(css, /\.post-media\s*\{[^}]*cursor:\s*zoom-in/s);
});

test("mobile stories and explorer identity reserve space instead of overlapping", async () => {
  const css = await source("app/globals.css");
  assert.match(css, /Screenshot-led mobile collision fixes/);
  assert.match(css, /\.adventure-reel\s*>\s*button\s*\{[^}]*grid-template-rows:\s*70px 19px 17px/s);
  assert.match(css, /\.adventure-reel button strong,[^}]*\.adventure-reel button small\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(css, /\.explorer-identity \.cover-label\s*\{[^}]*top:\s*max\(14px,[^}]*bottom:\s*auto/s);
  assert.match(css, /\.explorer-identity \.profile-body h2\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*white-space:\s*normal/s);
  assert.match(css, /\.explorer-identity \.profile-avatar\s*\{[^}]*width:\s*clamp\(74px, 22vw, 84px\)/s);
});

test("journeys store validated Google places for the accessible activity map", async () => {
  const schema = await source("db/schema.ts");
  const postsApi = await source("app/api/posts/route.ts");
  const picker = await source("app/components/google-location-picker.tsx");
  const map = await source("app/components/explore-map.tsx");
  for (const field of ["latitude", "longitude", "placeId"]) {
    assert.match(schema, new RegExp(field));
    assert.match(postsApi, new RegExp(field));
  }
  assert.match(postsApi, /latitude < -90 \|\| latitude > 90/);
  assert.match(postsApi, /longitude < -180 \|\| longitude > 180/);
  assert.match(postsApi, /Choose a location from Google Maps/);
  assert.match(picker, /AutocompleteSuggestion/);
  assert.match(picker, /prediction\.toPlace\(/);
  assert.match(map, /AdvancedMarkerElement/);
  assert.match(map, /gmpClickable: true/);
  assert.match(map, /title:/);
  assert.match(map, /arrow keys/);
  assert.doesNotMatch(`${picker}\n${map}`, /google\.maps\.importLibrary/);
});

test("friendship, comments, reactions, reports and owner deletion are server-backed", async () => {
  const schema = await source("db/schema.ts");
  const friendApi = await source("app/api/friends/route.ts");
  const commentsApi = await source("app/api/posts/[id]/comments/route.ts");
  const deleteCommentApi = await source("app/api/posts/[id]/comments/[commentId]/route.ts");
  const postsApi = await source("app/api/posts/route.ts");
  const page = await source("app/page.tsx");
  const positiveComments = await source("app/positive-comments.ts");
  const deleteApi = await source("app/api/posts/[id]/route.ts");
  for (const table of ["friendships", "comments", "reactions", "reports"]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(friendApi, /requestedByEmail/);
  assert.match(friendApi, /Only the recipient can accept/);
  assert.match(commentsApi, /isApprovedEncouragement/);
  assert.match(deleteCommentApi, /comment\.authorEmail !== user\.email && post\.authorEmail !== user\.email/);
  assert.match(deleteCommentApi, /Only the comment author or journey owner can delete/);
  assert.match(page, /Delete this encouragement/);
  assert.match(postsApi, /isApprovedEncouragement/);
  assert.match(positiveComments, /You motivated me/);
  assert.doesNotMatch(page, /Write something positive/);
  assert.match(page, /free-text public comments are switched off/);
  assert.match(page, /Your friends’ journeys/);
  assert.match(page, /Invite friends/);
  assert.match(page, /messages-active/);
  assert.match(deleteApi, /eq\(posts\.authorEmail, user\.email\)/);
});

test("the beta migration clears old trial activity without deleting member accounts", async () => {
  const migration = await source("drizzle/0002_mighty_shard.sql");
  assert.match(migration, /DELETE FROM `reactions`/);
  assert.match(migration, /DELETE FROM `posts`/);
  assert.doesNotMatch(migration, /DELETE FROM `profiles`/);
});
