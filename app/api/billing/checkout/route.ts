import { getChatGPTUser } from "../../../chatgpt-auth";
import { emitAnalytics, getMonetizationConfig } from "../../../monetization";
import { createStripeCheckout } from "../../../stripe-billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to choose Roavly+." }, { status: 401 });
  const payload = (await request.json()) as { plan?: "monthly" | "annual" };
  const plan = payload.plan === "annual" ? "annual" : "monthly";
  const config = await getMonetizationConfig();
  const priceId = plan === "annual" ? config.stripeAnnualPriceId : config.stripeMonthlyPriceId;
  if (!config.stripeSecretKey || !priceId) return Response.json({ error: "Roavly+ billing is not configured yet." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const checkout = await createStripeCheckout({
    mode: "subscription",
    customerEmail: user.email,
    successUrl: `${origin}/?checkout=success&surface=roavly-plus`,
    cancelUrl: `${origin}/?checkout=cancelled&surface=roavly-plus`,
    metadata: { kind: "roavly_plus", user_email: user.email, plan },
    priceId,
  });
  if (!checkout?.url) return Response.json({ error: "Roavly+ billing is not configured yet." }, { status: 503 });
  await emitAnalytics({ eventName: "subscription_checkout_started", userEmail: user.email, entityType: "subscription", entityId: checkout.id, properties: { plan } });
  return Response.json({ checkoutUrl: checkout.url, sessionId: checkout.id });
}
