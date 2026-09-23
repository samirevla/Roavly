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
