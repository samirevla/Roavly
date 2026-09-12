# Waymark standalone test guide

Waymark authenticates with email + password. ChatGPT/Sites login is not required.

## Prerequisites

- Node.js >=22.13.0, npm, Linux shell with flock/timeout

## Setup and run

1. npm run setup  (or install:ci then copy .env.example to .env.local)
2. npm run dev
3. Open the local URL
4. Sign up on welcome screen or /login with email + password (8+ chars)
5. Confirm empty feed loads, create a journey post with a photo, then sign out

If local D1 has no sqlite yet (fresh clone), start the Vite/Miniflare process once (step 2 above) so .wrangler creates the D1 sqlite, then re-run setup (step 1) so drizzle migrations apply. Setup runs migrate-local-d1 after creating .env.local.


Maps and Stripe are optional for core auth/social flows. No third-party login.

## Automated tests

- npm run lint
- npm test

npm test builds the Worker and runs tests/*, including tests/standalone-auth.test.mjs
(signup, login, wrong password, logout, session, authenticated feed + journey post).

Runtime-stress tests set ROAVLY_ALLOW_SITES_HEADERS=1 only inside the harness.
Standalone/production defaults keep Sites headers off.

## Auth notes

- Cookie: roavly_session (HttpOnly, SameSite=Lax, Secure on HTTPS)
- Password: PBKDF2-SHA256, per-user salt, 100k iterations
- Tables: auth_accounts; sessions reuse mobile_auth_sessions
- Sites headers: off unless ROAVLY_ALLOW_SITES_HEADERS=1
- Session length: AUTH_SESSION_DAYS (default 30)

## Remaining blockers

- git push / gh auth may be unavailable (local commits still work)
- Cloudflare D1/R2 deploy + production secrets are separate
- Google Maps needs a restricted browser key + map ID for place picker UX
