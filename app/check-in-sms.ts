import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { checkInSms } from "../db/schema";
type Database = Awaited<ReturnType<typeof getDb>>;

/** Cloudflare Worker secret names. Set with `wrangler secret put`. Never commit values. */
export const TWILIO_ACCOUNT_SID = "TWILIO_ACCOUNT_SID";
export const TWILIO_AUTH_TOKEN = "TWILIO_AUTH_TOKEN";
export const TWILIO_FROM_NUMBER = "TWILIO_FROM_NUMBER";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

type SmsFetch = (input: string, init: RequestInit) => Promise<Response>;

async function readEnvValue(key: string): Promise<string> {
  const testEnv = (
    globalThis as typeof globalThis & {
      __ROAVLY_TEST_ENV__?: Record<string, unknown>;
    }
  ).__ROAVLY_TEST_ENV__;
  if (testEnv) {
    if (key in testEnv) return String(testEnv[key] ?? "");
    return "";
  }
  try {
    const { env } = await import("cloudflare:workers");
    return String((env as Record<string, unknown>)[key] ?? "");
  } catch {
    return "";
  }
}

export async function loadTwilioConfig(): Promise<TwilioConfig | null> {
  const accountSid = (await readEnvValue(TWILIO_ACCOUNT_SID)).trim();
  const authToken = (await readEnvValue(TWILIO_AUTH_TOKEN)).trim();
  const fromNumber = (await readEnvValue(TWILIO_FROM_NUMBER)).trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export async function smsAlertsConfigured() {
  return Boolean(await loadTwilioConfig());
}

/**
 * Pull a single E.164 number out of the safety circle's free-text contact field.
 * Emails and labels with no number return null so we never text a guess.
 */
export function phoneFromContactMethod(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;

  const plus = raw.match(/\+\s*(\d[\d\s().-]{6,20}\d)/);
  if (plus) {
    const digits = plus[1].replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }

  if (/[A-Za-z]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (/^04\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^614\d{8}$/.test(digits)) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function overdueSmsBody(displayName: string) {
  const name = displayName.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "A Waymark participant";
  return `Waymark: ${name} missed a check-in and has not marked I’m safe.`;
}

function smsFetch(): SmsFetch {
  const injected = (
    globalThis as typeof globalThis & { __ROAVLY_TEST_SMS_FETCH__?: SmsFetch }
  ).__ROAVLY_TEST_SMS_FETCH__;
  if (typeof injected === "function") return injected;
  return (input, init) => fetch(input, init);
}

class RetryableSmsError extends Error {}

async function postTwilioSms(config: TwilioConfig, to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const response = await smsFetch()(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: config.fromNumber, Body: body }).toString(),
  });
  if (response.status >= 500 || response.status === 429) {
    throw new RetryableSmsError(`Twilio SMS failed (${response.status})`);
  }
  if (!response.ok) {
    console.error(`Waymark overdue SMS was rejected (${response.status}).`);
  }
}

/**
 * Sends at most one SMS for this check-in window. A later check-in changes the
 * anchor, so a new miss can text once. I’m safe / completed never reach here.
 * Missing phone or Twilio config returns without throwing or recording a send.
 */
export async function maybeSendOverdueSms(
  db: Database,
  input: {
    config: TwilioConfig | null;
    planId: string;
    memberId: string;
    anchor: Date;
    displayName: string;
    contactMethod: string | null | undefined;
    now: Date;
  },
) {
  if (!input.config) return;
  const to = phoneFromContactMethod(input.contactMethod);
  if (!to) return;

  const id = `overdue:${input.planId}:${input.memberId}:${input.anchor.getTime()}`;
  const inserted = await db
    .insert(checkInSms)
    .values({
      id,
      planId: input.planId,
      memberId: input.memberId,
      anchorMs: input.anchor.getTime(),
      sentAt: input.now,
    })
    .onConflictDoNothing()
    .returning({ id: checkInSms.id });
  if (!inserted.length) return;

  try {
    await postTwilioSms(input.config, to, overdueSmsBody(input.displayName));
  } catch (error) {
    await db.delete(checkInSms).where(eq(checkInSms.id, id));
    if (!(error instanceof RetryableSmsError)) {
      console.error("Waymark overdue SMS failed.");
    }
  }
}
