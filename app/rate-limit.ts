/**
 * Isolate-local sliding-window rate limiter for Cloudflare Workers.
 *
 * Caveat: counters live in the current Worker isolate memory only. They are not
 * shared across isolates/regions and reset on cold start. This is an intentional
 * RED (no migration) reliability guardrail — not a global quota store.
 */

export type RateLimitWindow = {
  limit: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  posts: { limit: 10, windowMs: 60_000 },
  comments: { limit: 30, windowMs: 60_000 },
  messages: { limit: 60, windowMs: 60_000 },
  diagnostics: { limit: 20, windowMs: 60_000 },
  motivate: { limit: 60, windowMs: 60_000 },
  report: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitWindow>;

const buckets = new Map<string, number[]>();

/** Test-only: clear isolate-local counters between cases. */
export function resetRateLimitBuckets() {
  buckets.clear();
}

export function checkRateLimit(
  key: string,
  window: RateLimitWindow,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const windowStart = now - window.windowMs;
  const prior = buckets.get(key) ?? [];
  const recent = prior.filter((timestamp) => timestamp > windowStart);

  if (recent.length >= window.limit) {
    buckets.set(key, recent);
    const retryAfterMs = recent[0] + window.windowMs - now;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
    };
  }

  recent.push(now);
  buckets.set(key, recent);
  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, window.limit - recent.length),
  };
}

export function rateLimitedResponse(retryAfterSec: number) {
  return Response.json(
    {
      error: "Too many requests. Please slow down and try again.",
      retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Returns a 429 Response when over cap; otherwise null. */
export function enforceRateLimit(key: string, window: RateLimitWindow) {
  const result = checkRateLimit(key, window);
  if (result.allowed) return null;
  return rateLimitedResponse(result.retryAfterSec);
}

/** Best-effort client IP for anonymous diagnostics (CF / forwarded headers). */
export function clientIpFromRequest(request: Request) {
  const cfConnecting = request.headers.get("cf-connecting-ip")?.trim();
  if (cfConnecting) return cfConnecting;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return "unknown";
}
