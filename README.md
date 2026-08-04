# Roavly

Roavly is a positive social platform for outdoor activities. Members share real
journeys, discover places on a map, motivate friends, plan group adventures,
message one another, track time outdoors and unlock achievements.

The current production site is [roavly-app.ssemsedinovski.chatgpt.site](https://roavly-app.ssemsedinovski.chatgpt.site).

## Product principles

- Core social posting remains free.
- There is no dislike button. The primary reaction is “I’m motivated”.
- Public location sharing defaults to approximate, with stricter protection for minors.
- Journey safety controls unlock only after a journey starts.
- Empty screens use real empty states; do not add fake members, posts or engagement.
- The interface is mobile-first and should feel like a premium native social product.

## Technology

- TypeScript, React 19 and Vinext
- Cloudflare Workers runtime
- Cloudflare D1 with Drizzle ORM
- Cloudflare R2 for uploaded media
- Google Maps and Places
- Expo/React Native iPhone client in `mobile/`
- Stripe Checkout, Billing and Connect integration points
- ChatGPT/Sites identity headers for the currently hosted web version

## Local web development

Requirements: Node.js `>=22.13.0`, npm and a Linux-compatible shell for the
bounded build scripts.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Useful commands:

```bash
npm run lint
npm test
npm run build
npm run db:generate
```

`npm test` builds the deployable Worker and runs the complete source, migration,
runtime-stress and responsive-layout regression suite.

## Database and uploads

The complete relational schema is in `db/schema.ts`. Generated migrations live
in `drizzle/` and must remain ordered. The hosting manifest binds D1 as `DB` and
R2 as `BUCKET`.

Do not commit database exports, user accounts, posts, direct messages, uploaded
photos or videos. They are production data, not source code.

## iPhone app

The native Expo project lives in `mobile/`. See `mobile/README.md` for local,
development-build and TestFlight instructions.

## Monetization

The codebase contains the foundation for trail-tip purchases, Roavly+ feature
flags, creator payouts, affiliate gear attribution, local partners, sponsored
challenges and disclosed native ads. Real payments remain disabled until Stripe
keys, products and a verified webhook are configured.

## Handoff

Read [`CLAUDE.md`](CLAUDE.md) before making changes. It documents the architecture,
non-negotiable product rules, environment variables, production gaps and safest
next steps.

Never commit unrestricted Google, Stripe, Apple or Expo credentials.
