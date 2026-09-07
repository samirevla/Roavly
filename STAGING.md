# Roavly Cloudflare staging

Staging runs on Cloudflare Workers + D1 + R2, separate from production OpenAI Sites.

## Intended URL

https://roavly-staging.<account-subdomain>.workers.dev

Confirm the exact hostname with wrangler deployments list or the Cloudflare dashboard under Workers -> roavly-staging.

## One-time Cloudflare setup

1. Authenticate with Cloudflare (wrangler login; do not commit tokens)
2. Create D1: wrangler d1 create roavly-staging-db — paste database_id into wrangler.staging.toml (replace REPLACE_D1_ID)
3. Create R2: wrangler r2 bucket create roavly-staging-media
4. Ensure Node >= 22.13 (/workspace/.local/node-v22.13.0-linux-x64/bin is used automatically by scripts/deploy-staging.sh when present)

## What testers need

- Staging workers.dev URL (HTTPS)
- Email + password signup/login (no ChatGPT / Sites login)
- Journey post with photo (R2 media)
- Sites chrome headers off
- Session cookie roavly_session for AUTH_SESSION_DAYS (30)
- No production OpenAI Sites credentials

## Deploy helper

Use scripts/deploy-staging.sh after one-time setup above.
It builds the app, applies drizzle/*.sql to remote D1 in order, publishes the Worker, and notes that [vars] already set ROAVLY_ALLOW_SITES_HEADERS=0 and AUTH_SESSION_DAYS=30 (optional secrets via wrangler secret put).

Asset binding: [assets] directory = "./dist/client" (matches vinext / current dist/client output).

## Local vs staging

| | Local / Sites preview | Staging Workers |
|---|---|---|
| Config | vite.config.ts Cloudflare plugin | wrangler.staging.toml |
| D1 | Miniflare under .wrangler/ | roavly-staging-db (remote) |
| R2 | Local binding | roavly-staging-media |
| Headers | ROAVLY_ALLOW_SITES_HEADERS from .env.local | [vars] = 0 |
