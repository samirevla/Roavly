import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { authAccounts, mobileAuthSessions, profiles } from "../db/schema";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

/** Alias for standalone app identity (same shape as ChatGPTUser). */
export type AppUser = ChatGPTUser;

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/login";
const SIGN_OUT_PATH = "/api/auth/logout";
const CALLBACK_PATH = "/callback";
export const SESSION_COOKIE_NAME = "roavly_session";
const PBKDF2_ITERATIONS = 100_000;
const DEFAULT_SESSION_DAYS = 30;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();

  const cookieToken = sessionTokenFromCookieHeader(
    requestHeaders.get("cookie"),
  );
  if (cookieToken) {
    const user = await userFromSessionToken(cookieToken);
    if (user) return user;
  }

  const token = bearerToken(requestHeaders.get("authorization"));
  if (token) {
    const user = await userFromSessionToken(token);
    if (user) return user;
  }

  if (await allowSitesHeaders()) {
    const email = requestHeaders.get(USER_EMAIL_HEADER);
    if (email) {
      const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
      const fullName =
        encodedFullName &&
        requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) ===
          PERCENT_ENCODED_UTF8
          ? safeDecodeURIComponent(encodedFullName)
          : null;

      return {
        displayName: fullName ?? email,
        email,
        fullName,
      };
    }
  }

  return null;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function appSignInPath(returnTo: string): string {
  return chatGPTSignInPath(returnTo);
}

export function appSignOutPath(returnTo = "/"): string {
  return chatGPTSignOutPath(returnTo);
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH ||
    pathname.startsWith("/api/auth/")
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function bearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(value.trim());
  return match?.[1] ?? null;
}

export async function hashMobileSecret(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function createMobileSecret(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createPasswordSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(
  password: string,
  saltHex: string,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(derived));
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashPassword(password, saltHex);
  return timingSafeEqualHex(actual, expectedHash);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 200;
}

export async function sessionDays(): Promise<number> {
  const raw = await readEnvValue("AUTH_SESSION_DAYS");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_SESSION_DAYS;
  }
  return Math.floor(parsed);
}

export async function createWebSession(
  userEmail: string,
): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  const now = new Date();
  const days = await sessionDays();
  const token = createMobileSecret(48);
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await db.insert(mobileAuthSessions).values({
    id: crypto.randomUUID(),
    tokenHash: await hashMobileSecret(token),
    userEmail,
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
  });
  return { token, expiresAt };
}

export async function destroyWebSession(token: string | null): Promise<void> {
  if (!token) return;
  const db = await getDb();
  await db
    .delete(mobileAuthSessions)
    .where(eq(mobileAuthSessions.tokenHash, await hashMobileSecret(token)));
}

export function sessionCookieHeader(
  token: string,
  expiresAt: Date,
  requestUrl: string,
): string {
  const secure = requestUrl.startsWith("https:");
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(requestUrl: string): string {
  const secure = requestUrl.startsWith("https:");
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) continue;
    const value = rest.join("=").trim();
    if (/^[A-Za-z0-9_-]{32,200}$/.test(value)) return value;
  }
  return null;
}

export async function ensureProfileForUser(
  user: ChatGPTUser,
): Promise<typeof profiles.$inferSelect> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, user.email))
    .limit(1);
  if (existing) return existing;

  const now = new Date();
  const usernameBase =
    cleanUsername(user.fullName || user.email.split("@")[0]) || "roavly.member";
  const [usernameTaken] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.username, usernameBase))
    .limit(1);
  const username = usernameTaken
    ? `${usernameBase.slice(0, 19)}.${crypto.randomUUID().slice(0, 4)}`
    : usernameBase;
  const [profile] = await db
    .insert(profiles)
    .values({
      email: user.email,
      displayName: user.fullName || user.displayName,
      username,
      bio: "",
      homeBase: "",
      favoriteActivities: "",
      ageBand: "Prefer not to say",
      experienceLevel: "All levels",
      pacePreference: "Flexible",
      availability: "Weekends",
      travelRadiusKm: 50,
      groupStyle: "Social",
      accessibilityNeeds: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return profile;
}

export async function createAuthAccount(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<ChatGPTUser> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new AuthError("Enter a valid email address.", 400);
  }
  if (!isValidPassword(input.password)) {
    throw new AuthError("Password must be at least 8 characters.", 400);
  }

  const db = await getDb();
  const [existing] = await db
    .select({ email: authAccounts.email })
    .from(authAccounts)
    .where(eq(authAccounts.email, email))
    .limit(1);
  if (existing) {
    throw new AuthError("An account with that email already exists.", 409);
  }

  const now = new Date();
  const salt = createPasswordSalt();
  const passwordHash = await hashPassword(input.password, salt);
  await db.insert(authAccounts).values({
    email,
    passwordHash,
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  });

  const displayName =
    input.displayName?.trim().slice(0, 60) ||
    email.split("@")[0] ||
    "Waymark member";
  const user: ChatGPTUser = {
    email,
    displayName,
    fullName: displayName,
  };
  await ensureProfileForUser(user);
  return user;
}

export async function authenticateAccount(
  emailRaw: string,
  password: string,
): Promise<ChatGPTUser> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email) || !password) {
    throw new AuthError("Invalid email or password.", 401);
  }

  const db = await getDb();
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(eq(authAccounts.email, email))
    .limit(1);
  if (!account) {
    throw new AuthError("Invalid email or password.", 401);
  }
  const ok = await verifyPassword(
    password,
    account.passwordSalt,
    account.passwordHash,
  );
  if (!ok) {
    throw new AuthError("Invalid email or password.", 401);
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  return {
    email,
    displayName: profile?.displayName || email,
    fullName: profile?.displayName || null,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function userFromSessionToken(
  token: string,
): Promise<ChatGPTUser | null> {
  const db = await getDb();
  const now = new Date();
  const tokenHash = await hashMobileSecret(token);
  const [session] = await db
    .select()
    .from(mobileAuthSessions)
    .where(
      and(
        eq(mobileAuthSessions.tokenHash, tokenHash),
        gt(mobileAuthSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!session) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.email, session.userEmail))
    .limit(1);

  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db
      .update(mobileAuthSessions)
      .set({ lastSeenAt: now })
      .where(eq(mobileAuthSessions.id, session.id));
  }

  return {
    displayName: profile?.displayName || session.userEmail,
    email: session.userEmail,
    fullName: profile?.displayName || null,
  };
}

async function allowSitesHeaders(): Promise<boolean> {
  const value = await readEnvValue("ROAVLY_ALLOW_SITES_HEADERS");
  return value === "1";
}

async function readEnvValue(key: string): Promise<string> {
  const testEnv = (
    globalThis as typeof globalThis & {
      __ROAVLY_TEST_ENV__?: Record<string, unknown>;
    }
  ).__ROAVLY_TEST_ENV__;
  if (testEnv) {
    if (key in testEnv) return String(testEnv[key] ?? "");
    // When the test harness injected env, skip cloudflare:workers entirely.
    return "";
  }
  try {
    const { env } = await import("cloudflare:workers");
    return String((env as Record<string, unknown>)[key] ?? "");
  } catch {
    return "";
  }
}

function cleanUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 24);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
