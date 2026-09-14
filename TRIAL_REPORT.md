# Waymark User Trial Report

**Date:** 2026-09-09 (Melbourne / UTC+10)  
**Branch:** `roavly-builder/standalone-auth` @ `8f52aab`  
**Worker:** `http://127.0.0.1:8787` (wrangler local)  
**HTTPS tunnel:** `https://dispatched-connections-tramadol-yes.trycloudflare.com`  
**Harness:** `tests/user-trial-100.mjs`  
**Verdict:** **ready-with-caveats**

---

## Summary

| Metric | Value |
| --- | --- |
| Scenarios executed | **105** |
| PASS | **105** |
| FAIL | **0** |
| Duration (final run) | ~2.3s |
| App code fixes required | **0** (no reproducible product bugs found) |
| Harness commits | `8f52aab` — add live 105-scenario trial |

Final command:

```bash
BASE=http://127.0.0.1:8787 node --test tests/user-trial-100.mjs
# => # pass 105 / # fail 0
```

---

## Coverage (105 numbered scenarios)

1. **Public / health (1–10):** `/`, `/login`, unauthenticated session/me, 401 gates on posts/friends/conversations/maps/action-hub/monetization.
2. **Auth (11–25):** signup validation, three-user signup, duplicate rejection, wrong/unknown login, session cookie, logout clears + invalidates token, login without email.
3. **Profile /me (26–40):** auto-profile, multi-user profile updates, username conflict 409, username sanitization, age band, travel-radius clamp, bio/homeBase persistence.
4. **Posts / journeys (41–55):** photo + placeId validation, minimal PNG upload, feed visibility, media fetch (auth), motivate toggle (`motivated` + feed `viewerMotivated`), free-text vs approved encouragement comments, self-report blocked, cross-user report.
5. **Friends (56–65):** list, request/accept, unknown user 404, decline, block + hide.
6. **Messaging (66–75):** direct conversation idempotency, send/read/reply, empty body 400, non-member denied, group name validation + create.
7. **Saves / plans / clubs / safety / hub / maps (76–85):** save/plan/complete, create plan + invite friend, club create/join/leave, safety circle, action-hub payload, maps config (200 or expected 503), client-diagnostics **204**.
8. **Monetization / trails / gear / ads smoke (86–93):** monetization dashboard, Stripe checkout **503** when unconfigured (no charges), creator status, trails list + create from post, gear catalog + tag, ads/partners/challenges.
9. **Stress / edges (94–105):** second + inspired posts, 20-parallel authenticated GETs (no 5xx), 10-parallel feed reads, invalid JSON login <500, long caption rejected, home still 200, purchased-tips/payouts/admin gates, club leave, save complete.

---

## Bugs found & fixes

### Product bugs
**None reproducible.** All initial failures were harness assertion mismatches against the real API contracts:

| Scenario | Initial failure | Root cause | Resolution |
| --- | --- | --- | --- |
| 048–050 Motivate | expected `viewerMotivated` | Motivate API returns `{ motivated, motivationCount }`; feed uses `viewerMotivated` (client maps `payload.motivated`) | Harness asserts `motivated` + feed `viewerMotivated` |
| 085 Diagnostics | expected 200/201 body | Endpoint correctly returns **204 No Content** | Harness asserts `204` |

No app source changes were required for the trial to pass.

### Ops issue during refresh (not a product bug)
Refreshing `roavly-prod-serve/server` by wiping the directory also wiped the local Miniflare D1 file under `server/.wrangler/…`, causing `no such table: auth_accounts` (signup 500). **Remediation:** re-applied all `drizzle/*.sql` migrations to the active local D1 (150 statements). Signup restored; full trial re-run **105/105**.

**Lesson:** when refreshing prod-serve artifacts, preserve `.wrangler/state` (or re-run `scripts/migrate-local-d1.mjs` / equivalent against the active sqlite).

---

## Production readiness checklist

| Area | Status | Notes |
| --- | --- | --- |
| Standalone email auth (signup/login/session/logout) | OK | Cookie `roavly_session`, logout clears + destroys server session |
| Profile /me | OK | Username uniqueness, clamps, age band |
| Journey create + media | OK | Minimal PNG upload + authenticated media GET |
| Social (friends, motivate, comments, report, block) | OK | Positive-encouragement allowlist enforced |
| Messaging | OK | Direct + group |
| Saves / plans / clubs / safety / action-hub | OK | |
| Stress bursts | OK | No 5xx under parallel authenticated reads |
| Verified build | OK | `bash scripts/build-verified.sh` passed; artifact validated |
| Local Worker + tunnel | OK | `/` → 200 on 8787 and trycloudflare URL |
| Google Maps key | **Deferred** | `/api/maps/config` → 503 without `GOOGLE_MAPS_API_KEY` (known) |
| Stripe live billing | **Deferred** | Checkout → 503 when secret/price unset; **no real charges** in trial |
| Remote Cloudflare staging costs | **Deferred** | Local-only Worker + quick tunnel |

---

## Blockers / caveats (RED — documented, not rewritten)

1. **Google Maps API key** not configured in local serve → maps picker/config unavailable (503). Required for production map UX.
2. **Stripe** not configured → Waymark+ checkout intentionally unavailable (503). No live charges exercised.
3. **Remote Cloudflare staging / paid resources** not exercised (cost deferral).
4. **No single-post GET** on `/api/posts/:id` (DELETE only) — feed-centric design; not treated as a trial failure.
5. **Local D1 is ephemeral** to Miniflare state path — ops must migrate after wiping serve dirs.

---

## Commits

- `8f52aab` — `test: add live 105-scenario Waymark user trial harness` (pushed to `origin/roavly-builder/standalone-auth`)

---

## Go / No-go

**ready-with-caveats**

Ship-ready for a local/tunnel beta of standalone-auth social core (auth → journey → friends → chat → plans/clubs/safety). Do **not** call production-complete until Maps key + Stripe (or explicit “billing off”) are configured and a remote staging pass is done.
