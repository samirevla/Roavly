/** Signed same-origin upload tokens for streaming R2 PUTs (HMAC-SHA256). */

export type UploadPurpose = "tip_media" | "tip_preview" | "post_photo";

export type UploadTokenPayload = {
  key: string;
  contentType: string;
  maxBytes: number;
  ownerEmail: string;
  purpose: UploadPurpose;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 12 * 60;

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signUploadToken(
  payload: Omit<UploadTokenPayload, "exp"> & { exp?: number },
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<{ token: string; expiresAt: string; payload: UploadTokenPayload }> {
  if (!secret) throw new Error("Upload signing secret is required.");
  const full: UploadTokenPayload = {
    key: payload.key,
    contentType: payload.contentType,
    maxBytes: payload.maxBytes,
    ownerEmail: payload.ownerEmail,
    purpose: payload.purpose,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const signature = bytesToBase64Url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return {
    token: `${body}.${signature}`,
    expiresAt: new Date(full.exp * 1000).toISOString(),
    payload: full,
  };
}

export async function verifyUploadToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<UploadTokenPayload | null> {
  if (!secret || !token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await hmacKey(secret);
  const expected = bytesToBase64Url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  if (!timingSafeEqual(expected, signature)) return null;
  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as UploadTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.key !== "string" ||
    typeof payload.contentType !== "string" ||
    typeof payload.maxBytes !== "number" ||
    typeof payload.ownerEmail !== "string" ||
    typeof payload.purpose !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp < nowSeconds) return null;
  return payload;
}

/** Resolve UPLOAD_SIGNING_SECRET from Workers env or test injection. */
export async function getUploadSigningSecret(): Promise<string> {
  const injected = (
    globalThis as typeof globalThis & { __ROAVLY_TEST_UPLOAD_SECRET__?: string }
  ).__ROAVLY_TEST_UPLOAD_SECRET__;
  if (injected) return injected;

  const { env } = await import("cloudflare:workers");
  const secret = (env as unknown as { UPLOAD_SIGNING_SECRET?: string }).UPLOAD_SIGNING_SECRET;
  if (!secret) {
    throw new Error(
      "UPLOAD_SIGNING_SECRET is not configured. Set it with wrangler secret put on staging/production.",
    );
  }
  return secret;
}
