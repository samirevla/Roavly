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
  echo "Paste the D1 database_id into wrangler.toml (replace REPLACE_D1_ID)." >&2
  exit 1
fi

if grep -q REPLACE_D1_ID wrangler.toml; then
  echo "wrangler.toml still has placeholder database_id REPLACE_D1_ID." >&2
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
  wrangler d1 execute roavly-staging-db --remote --file="${sql}"
done

echo "==> Publishing Worker..."
wrangler deploy

echo
echo "==> Vars already in wrangler.toml [vars]:"
echo "    ROAVLY_ALLOW_SITES_HEADERS=0"
echo "    AUTH_SESSION_DAYS=30"
echo
echo "Optional: wrangler secret put <NAME> for additional secrets"
echo "  # echo 0 | wrangler secret put ROAVLY_ALLOW_SITES_HEADERS"
echo
echo "Staging URL pattern: https://roavly-staging.<account-subdomain>.workers.dev"
echo "Done."
