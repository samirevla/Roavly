#!/usr/bin/env bash
# Staging publish helper for Cloudflare Workers + D1 + R2.
# Separate from OpenAI Sites production. Does not run login itself.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

NODE22_BIN="/workspace/.local/node-v22.13.0-linux-x64/bin"
if [[ -d "${NODE22_BIN}" ]]; then
  export PATH="${NODE22_BIN}:${PATH}"
fi

command -v wrangler >/dev/null 2>&1 || {
  echo "wrangler not found on PATH. Install deps or use npx wrangler." >&2
  exit 1
}

echo "==> Checking Cloudflare auth..."
if ! wrangler whoami >/dev/null 2>&1; then
  echo "Not logged in to Cloudflare. Run wrangler login first." >&2
  echo "Then create resources once:" >&2
  echo "  wrangler d1 create roavly-staging-db" >&2
  echo "  wrangler r2 bucket create roavly-staging-media" >&2
  echo "Paste the D1 database_id into wrangler.staging.toml." >&2
  exit 1
fi

if grep -q REPLACE_D1_ID wrangler.staging.toml; then
  echo "wrangler.staging.toml still has placeholder database_id REPLACE_D1_ID." >&2
  exit 1
fi

echo "==> Building (package.json build / build-verified.sh)..."
bash scripts/build-verified.sh

echo "==> Applying drizzle migrations to remote D1..."
shopt -s nullglob
migrations=(drizzle/*.sql)
if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "No drizzle/*.sql migrations found." >&2
  exit 1
fi
mapfile -t migrations_sorted < <(printf '%s\n' "${migrations[@]}" | sort)
for sql in "${migrations_sorted[@]}"; do
  echo "    applying ${sql}"
  wrangler d1 execute roavly-staging-db --remote -c wrangler.staging.toml --file="${sql}" \
    || echo "    (tolerated failure for ${sql} — often already-applied)"
done

echo "==> Writing dist/server/wrangler.staging.json (vinext no_bundle + staging bindings)..."
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const built = JSON.parse(readFileSync(join(root, "dist/server/wrangler.json"), "utf8"));
built.name = "roavly-staging";
built.compatibility_date = "2026-05-15";
built.compatibility_flags = ["nodejs_compat"];
built.workers_dev = true;
built.d1_databases = [
  {
    binding: "DB",
    database_name: "roavly-staging-db",
    database_id: "75570cc5-7b80-4ac5-aa21-5c5da7b16337",
  },
];
built.r2_buckets = [
  {
    binding: "BUCKET",
    bucket_name: "roavly-staging-media",
  },
];
built.vars = {
  ROAVLY_ALLOW_SITES_HEADERS: "0",
  AUTH_SESSION_DAYS: "30",
};
built.assets = { directory: "../client", binding: "ASSETS" };
built.main = "index.js";
built.no_bundle = true;
writeFileSync(join(root, "dist/server/wrangler.staging.json"), JSON.stringify(built, null, 2));
console.log("    wrote dist/server/wrangler.staging.json");
NODE

echo "==> Publishing Worker..."
wrangler deploy -c dist/server/wrangler.staging.json

echo
echo "==> Vars already in wrangler.staging.toml [vars]:"
echo "    ROAVLY_ALLOW_SITES_HEADERS=0"
echo "    AUTH_SESSION_DAYS=30"
echo
echo "R2 bucket: roavly-staging-media (BUCKET)"
echo "Staging URL: https://roavly-staging.ssemsedinovski.workers.dev"
echo "Done."
