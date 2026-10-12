import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("admin content-report inbox reuses Roavly admin gate and triages open reports", async () => {
  const adminApi = await source("app/api/admin/reports/route.ts");
  const postReport = await source("app/api/posts/[id]/report/route.ts");
  const page = await source("app/admin/reports/page.tsx");
  const schema = await source("db/schema.ts");
  const css = await source("app/globals.css");

  assert.match(schema, /"content_reports"/);
  assert.match(adminApi, /isRoavlyAdmin/);
  assert.match(adminApi, /eq\(contentReports\.status, "open"\)/);
  assert.match(adminApi, /action !== "resolve" && action !== "dismiss"/);
  assert.match(adminApi, /status: nextStatus/);
  assert.match(adminApi, /legacy:/);
  assert.match(postReport, /contentReports/);
  assert.match(postReport, /targetType: "post"/);
  assert.match(page, /Moderation inbox/);
  assert.match(page, /\/api\/admin\/reports/);
  assert.match(page, /Resolve/);
  assert.match(page, /Dismiss/);
  assert.match(css, /\.admin-reports-screen/);
});

test("resolve soft-hides reported content and dismiss does not", async () => {
  const adminApi = await source("app/api/admin/reports/route.ts");
  const posts = await source("app/api/posts/route.ts");
  const comments = await source("app/api/posts/[id]/comments/route.ts");
  const clips = await source("app/api/clips/route.ts");
  const messages = await source("app/api/conversations/[id]/messages/route.ts");
  const conversations = await source("app/api/conversations/route.ts");
  const schema = await source("db/schema.ts");
  const migration = await source("drizzle/0016_soft_hide_content.sql");
  const page = await source("app/admin/reports/page.tsx");

  assert.match(schema, /hiddenAt: integer\("hidden_at"/);
  assert.match(migration, /ALTER TABLE `posts` ADD `hidden_at` integer/);
  assert.match(migration, /ALTER TABLE `comments` ADD `hidden_at` integer/);
  assert.match(migration, /ALTER TABLE `chat_messages` ADD `hidden_at` integer/);
  assert.match(adminApi, /action === "resolve"/);
  assert.match(adminApi, /setContentHidden\(db, existing\.targetType, existing\.targetId, true\)/);
  assert.match(adminApi, /action === "unhide"/);
  assert.match(adminApi, /setContentHidden\(db, targetType, targetId, false\)/);
  assert.match(adminApi, /status: 403/);
  assert.match(posts, /isNull\(posts\.hiddenAt\)/);
  assert.match(posts, /isNull\(comments\.hiddenAt\)/);
  assert.match(comments, /isNull\(comments\.hiddenAt\)/);
  assert.match(clips, /isNull\(posts\.hiddenAt\)/);
  assert.match(messages, /isNull\(chatMessages\.hiddenAt\)/);
  assert.match(conversations, /isNull\(chatMessages\.hiddenAt\)/);
  assert.match(page, /Undo hide/);
  assert.match(page, /action: "unhide"/);
  assert.doesNotMatch(adminApi, /if \(action === "dismiss"\) \{[\s\S]*setContentHidden/);
});

