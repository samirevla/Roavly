import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("tips create route never buffers media with arrayBuffer and relies on pre-upload", async () => {
  const tipRoute = await source("app/api/trails/[id]/tips/route.ts");
  const putRoute = await source("app/api/uploads/put/route.ts");
  const signRoute = await source("app/api/uploads/sign/route.ts");
  const tokenHelper = await source("app/upload-token.ts");
  const ui = await source("app/components/monetization-view.tsx");

  assert.doesNotMatch(tipRoute, /arrayBuffer\s*\(/);
  assert.match(tipRoute, /assertMediaObjectExists/);
  assert.match(tipRoute, /application\/json/);
  assert.match(putRoute, /request\.body/);
  assert.doesNotMatch(putRoute, /arrayBuffer\s*\(/);
  assert.match(signRoute, /tip_media/);
  assert.match(signRoute, /signUploadToken/);
  assert.match(tokenHelper, /HMAC/);
  assert.match(tokenHelper, /UPLOAD_SIGNING_SECRET|getUploadSigningSecret/);
  assert.match(ui, /preparePhotoForUpload/);
  assert.match(ui, /\/api\/uploads\/sign/);
});

test("journey posts use signed streaming upload without arrayBuffer buffering", async () => {
  const postsRoute = await source("app/api/posts/route.ts");
  const signRoute = await source("app/api/uploads/sign/route.ts");
  const putRoute = await source("app/api/uploads/put/route.ts");
  const page = await source("app/page.tsx");
  const tokenHelper = await source("app/upload-token.ts");

  assert.doesNotMatch(postsRoute, /arrayBuffer\s*\(/);
  assert.match(postsRoute, /assertMediaObjectExists/);
  assert.match(postsRoute, /application\/json/);
  assert.match(postsRoute, /imageKey/);
  assert.match(postsRoute, /postId/);
  assert.match(signRoute, /post_photo/);
  assert.match(signRoute, /MAX_PHOTO_BYTES/);
  assert.match(putRoute, /access: "journey"/);
  assert.match(tokenHelper, /post_photo/);
  assert.match(page, /\/api\/uploads\/sign/);
  assert.match(page, /post_photo/);
  assert.match(page, /preparePhotoForUpload/);
});

test("upload token helper exposes pure sign/verify that accept a secret string", async () => {
  const tokenHelper = await source("app/upload-token.ts");
  assert.match(tokenHelper, /export async function signUploadToken/);
  assert.match(tokenHelper, /export async function verifyUploadToken/);
  assert.match(tokenHelper, /ownerEmail/);
  assert.match(tokenHelper, /maxBytes/);
  assert.match(tokenHelper, /purpose/);
});

test("profile avatars use signed streaming upload without arrayBuffer buffering", async () => {
  const signRoute = await source("app/api/uploads/sign/route.ts");
  const putRoute = await source("app/api/uploads/put/route.ts");
  const meRoute = await source("app/api/me/route.ts");
  const schema = await source("db/schema.ts");
  const page = await source("app/page.tsx");
  const tokenHelper = await source("app/upload-token.ts");
  const mediaRoute = await source("app/api/media/[...key]/route.ts");

  assert.match(tokenHelper, /profile_avatar/);
  assert.match(signRoute, /profile_avatar/);
  assert.match(signRoute, /MAX_AVATAR_BYTES|avatars\//);
  assert.match(putRoute, /access: "avatar"/);
  assert.doesNotMatch(putRoute, /arrayBuffer\s*\(/);
  assert.doesNotMatch(meRoute, /arrayBuffer\s*\(/);
  assert.match(meRoute, /avatarKey/);
  assert.match(meRoute, /assertMediaObjectExists/);
  assert.match(schema, /avatarKey/);
  assert.match(schema, /avatar_key/);
  assert.match(page, /profile_avatar/);
  assert.match(page, /preparePhotoForUpload/);
  assert.match(page, /imageUrl/);
  assert.match(page, /has-image|<img/);
  assert.match(mediaRoute, /avatars\//);
});
