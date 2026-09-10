# Waymark Cloudflare staging

Staging runs on Cloudflare Workers + D1 + R2, separate from production OpenAI Sites.

**Live URL:** https://roavly-staging.ssemsedinovski.workers.dev

## Intended URL

https://roavly-staging.ssemsedinovski.workers.dev

Confirm with `wrangler deployments list -c dist/server/wrangler.staging.json` or the
Cloudflare dashboard under Workers → roavly-staging. Account workers.dev subdomain:
`ssemsedinovski`.

## One-time Cloudflare setup

1. Authenticate with Cloudflare (`wrangler login`; do not commit tokens)
2. Create D1: `wrangler d1 create roavly-staging-db` — paste `database_id` into
   `wrangler.staging.toml` (already set to `75570cc5-7b80-4ac5-aa21-5c5da7b16337`)
3. Create R2: `wrangler r2 bucket create roavly-staging-media` — bound as `BUCKET` in
   `wrangler.staging.toml` (already done)
4. Ensure Node >= 22.13 (`/workspace/.local/node-v22.13.0-linux-x64/bin` is used
   automatically by `scripts/deploy-staging.sh` when present)
5. Register a workers.dev subdomain once (Workers & Pages onboarding, or API
   `PUT /accounts/.../workers/subdomain`) if deploy says one is missing

## What testers need

- Staging workers.dev URL (HTTPS): https://roavly-staging.ssemsedinovski.workers.dev
- Email + password signup/login (no ChatGPT / Sites login)
- Journey posts with photos (R2 bucket `roavly-staging-media`)
- Sites chrome headers off
- Session cookie `roavly_session` for `AUTH_SESSION_DAYS` (30)
- No production OpenAI Sites credentials

## Deploy helper

Use `scripts/deploy-staging.sh` after one-time setup above.

It builds the app (`scripts/build-verified.sh`), applies sorted `drizzle/*.sql` to
remote D1 (tolerating already-exists), writes `dist/server/wrangler.staging.json`
from the vinext build output + staging bindings (D1 + R2), and publishes with
`wrangler deploy -c dist/server/wrangler.staging.json`.

`[vars]` already set `ROAVLY_ALLOW_SITES_HEADERS=0` and `AUTH_SESSION_DAYS=30`
(optional secrets via `wrangler secret put`).

Asset binding: `[assets] directory = "./dist/client"` (matches vinext / current
`dist/client` output).

## Local vs staging

| | Local / Sites preview | Staging Workers |
|---|---|---|
| Config | vite.config.ts Cloudflare plugin | wrangler.staging.toml → dist/server deploy |
| D1 | Miniflare under .wrangler/ | roavly-staging-db (remote) |
| R2 | Local binding | roavly-staging-media (`BUCKET`) |
| Headers | ROAVLY_ALLOW_SITES_HEADERS from .env.local | [vars] = 0 |
