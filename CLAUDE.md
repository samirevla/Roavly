# Roavly engineering handoff

This repository is the authoritative source handoff for Roavly. It was exported
from the live OpenAI Sites project after version 26 deployed successfully.

## Current state

- Production: `https://roavly-app.ssemsedinovski.chatgpt.site`
- Main web application: `app/`
- Native iPhone application: `mobile/`
- Database schema: `db/schema.ts`
- Ordered D1 migrations: `drizzle/`
- Regression tests: `tests/`
- Last verified result at handoff: 29 tests passing, lint passing, production build passing

## Product rules that must not regress

1. Do not add seeded/fake people, posts, comments, engagement or adventures.
2. Preserve every existing social feature and server-side ownership check.
3. Keep the core feed, posting, friends, messaging and journeys free.
4. “I’m motivated” replaces conventional likes; there are no dislikes.
5. Comments are encouragement-first and filtered server-side.
6. Under-18 accounts cannot expose precise locations.
7. Exact journey meeting coordinates remain hidden until a host accepts someone.
8. Check-in and “I’m safe” controls only appear after a journey starts.
9. Completed journey chats expire 48 hours after completion.
10. Maintain a mobile-first layout down to narrow iPhone widths and safe areas.
11. Never expose advertisements inside paid trail tips, checkout or onboarding.
12. Monetized trail information must pass moderation before becoming live.

## Architecture

### Web

The UI is a large client-led social application in `app/page.tsx` with focused
components under `app/components/`. API handlers follow Vinext/Next route-file
conventions under `app/api/`.

### Authentication

`app/chatgpt-auth.ts` reads Sites-provided authenticated-user headers and also
supports bearer tokens issued to the native iPhone client. The hosted Sites
dispatcher owns the browser sign-in and sign-out routes.

If moving away from OpenAI Sites, replace this identity boundary deliberately.
Do not simulate these headers on a public deployment. Preserve server-side
authorization in every write route.

### Persistence

- D1 binding: `DB`
- R2 binding: `BUCKET`
- ORM: Drizzle
- Schema changes require editing `db/schema.ts`, running `npm run db:generate`,
  inspecting the generated SQL and committing both SQL and Drizzle metadata.

Uploaded media bytes belong in R2. Only ownership and searchable metadata belong
in D1.

### Mobile

`mobile/` is an Expo/React Native app using the same API and a one-time web-to-app
authentication exchange. It requires a development/TestFlight build because the
callback uses the `roavly://auth` scheme.

## Important surfaces

- Feed, composer, profile and friends: `app/page.tsx`
- Discovery, saved journeys, plans, clubs and challenges: `app/components/discover-view.tsx`
- Map and Google place discovery: `app/components/explore-map.tsx`
- Messaging and journey chats: `app/components/messages-view.tsx`
- Monetization UI: `app/components/monetization-view.tsx`
- Monetization configuration and entitlements: `app/monetization.ts`
- Stripe REST/webhook helpers: `app/stripe-billing.ts`
- Photo preparation and HEIF handling: `app/client-photo.ts`, `app/photo-upload.ts`
- Positivity filter: `app/positive-comments.ts`

## Monetization implementation status

### Implemented foundation

- Trail-tip trails, uploads, preview access, moderation state, purchases, bundles,
  Roavly+ credit redemption, permanent buyer library, ratings and reports
- Configurable 70/30 default revenue split and fixed credit-funded creator payout
- Stripe Checkout, signature-verified webhooks, subscription status projection,
  refunds and Stripe Connect payout endpoints
- Central `hasFeature()` entitlement checks
- Free saved-journey cap and Roavly+ unlimited saves
- Curated gear tagging with server-side outbound-click attribution
- Admin-managed local partner placements
- Sponsored challenges calculated from real journey posts
- Disclosed native ad campaigns hidden from Roavly+ and protected surfaces
- Analytics events for monetization interactions

### Still requires production configuration or hardening

- Configure real Stripe products, secrets and webhook endpoint.
- Replace the placeholder five-product catalog with approved affiliate URLs.
- Add affiliate network conversion postbacks.
- Decide on an external ad-network/mediation SDK if native direct-sold ads are not enough.
- Replace app-proxied large-video uploads with direct multipart R2 uploads,
  transcoding, thumbnails and automated media scanning.
- Offline packs currently contain trail/community JSON, not offline map tiles.
- Advanced route planning is feature-flagged but needs a full route/elevation engine.
- Human moderators and admin emails must be configured before marketplace launch.
- Seller community thresholds currently use accepted-friend count because the
  existing social graph models mutual friends rather than one-way followers.

## Environment variables

Use `.env.example` as the non-secret reference. Key monetization values are
configurable rather than hardcoded. Never place production secrets in source,
issues, pull requests or AI prompts.

## Validation workflow

Before handing over a change:

```bash
npm run lint
npm test
```

For native changes also run the appropriate Expo/TypeScript checks from `mobile/`.
Test narrow iPhone widths whenever changing `app/globals.css`, profile identity,
stories, modals, location search, messages or the bottom navigation.

## Recommended next steps

1. Rotate and restrict any Google Maps key previously shared outside a secret manager.
2. Configure Stripe in test mode and exercise purchase, renewal, cancellation,
   refund, Connect onboarding and payout webhooks end-to-end.
3. Replace the Sites-specific browser authentication boundary if deploying to a
   different host.
4. Add direct-to-R2 media uploads and video processing.
5. Perform device QA on real iPhones before TestFlight submission.
6. Add production observability, rate limiting and structured moderation queues.

## Repository safety

Do not commit `.env*`, certificates, Apple signing files, Expo tokens, database
exports, R2 media dumps or production logs. The `.openai/hosting.json` project ID
is deployment metadata, not an authentication secret.
