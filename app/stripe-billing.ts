import { getMonetizationConfig } from "./monetization";

type CheckoutItem = {
  name: string;
  unitAmountCents: number;
  quantity?: number;
};

type CheckoutInput = {
  mode: "payment" | "subscription";
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  items?: CheckoutItem[];
  priceId?: string;
};

type StripeCheckoutSession = { id: string; url: string | null };

function appendMetadata(params: URLSearchParams, metadata: Record<string, string>) {
  Object.entries(metadata).forEach(([key, value]) => params.set(`metadata[${key}]`, value));
}

export async function createStripeCheckout(input: CheckoutInput) {
  const config = await getMonetizationConfig();
  if (!config.stripeSecretKey) return null;
  const params = new URLSearchParams({
    mode: input.mode,
    customer_email: input.customerEmail,
    client_reference_id: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  appendMetadata(params, input.metadata);
  if (input.mode === "subscription") {
    if (!input.priceId) throw new Error("The Roavly+ Stripe price is not configured.");
    params.set("line_items[0][price]", input.priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("subscription_data[metadata][user_email]", input.customerEmail);
    params.set("subscription_data[metadata][plan]", input.metadata.plan || "monthly");
  } else {
    (input.items || []).forEach((item, index) => {
      params.set(`line_items[${index}][price_data][currency]`, config.currency);
      params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
      params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
      params.set(`line_items[${index}][quantity]`, String(item.quantity || 1));
    });
    params.set("payment_intent_data[metadata][purchase_kind]", input.metadata.kind || "trail_tip");
    params.set("payment_intent_data[metadata][buyer_email]", input.customerEmail);
  }
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Stripe could not start checkout.");
  return payload;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyStripeWebhook(rawBody: string, signatureHeader: string | null) {
  const config = await getMonetizationConfig();
  if (!config.stripeWebhookSecret || !signatureHeader) return false;
  const fields = signatureHeader.split(",").map((part) => part.trim().split("="));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.stripeWebhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)),
  );
  return signatures.some((signature) => timingSafeEqual(expected, signature));
}

export async function refundStripeCheckoutSession(sessionId: string) {
  const config = await getMonetizationConfig();
  if (!config.stripeSecretKey) throw new Error("Stripe refunds are not configured.");
  const sessionResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand%5B%5D=payment_intent`,
    { headers: { authorization: `Bearer ${config.stripeSecretKey}` } },
  );
  const session = (await sessionResponse.json()) as { payment_intent?: string | { id?: string }; error?: { message?: string } };
  if (!sessionResponse.ok) throw new Error(session.error?.message || "Stripe could not find that payment.");
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error("That Checkout Session has no refundable payment.");
  const params = new URLSearchParams({ payment_intent: paymentIntentId, reason: "requested_by_customer" });
  const refundResponse = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: { authorization: `Bearer ${config.stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const refund = (await refundResponse.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!refundResponse.ok) throw new Error(refund.error?.message || "Stripe could not issue the refund.");
  return refund;
}

async function stripeForm(path: string, params: URLSearchParams) {
  const config = await getMonetizationConfig();
  if (!config.stripeSecretKey) throw new Error("Stripe Connect is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.stripeSecretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const payload = (await response.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Stripe could not complete that request.");
  return payload;
}

export async function createStripeConnectOnboarding(input: {
  email: string;
  existingAccountId?: string | null;
  refreshUrl: string;
  returnUrl: string;
}) {
  let accountId = input.existingAccountId || "";
  if (!accountId) {
    const account = await stripeForm("accounts", new URLSearchParams({
      type: "express",
      email: input.email,
      "capabilities[transfers][requested]": "true",
      "metadata[roavly_user_email]": input.email,
    }));
    accountId = stringField(account.id);
  }
  const link = await stripeForm("account_links", new URLSearchParams({
    account: accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: "account_onboarding",
  }));
  return { accountId, url: stringField(link.url) };
}

export async function transferCreatorPayout(input: { accountId: string; amountCents: number; creatorEmail: string }) {
  const config = await getMonetizationConfig();
  const transfer = await stripeForm("transfers", new URLSearchParams({
    amount: String(input.amountCents),
    currency: config.currency,
    destination: input.accountId,
    description: "Roavly trail briefing creator payout",
    "metadata[creator_email]": input.creatorEmail,
  }));
  return { id: stringField(transfer.id), amount: Number(transfer.amount) || input.amountCents };
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
