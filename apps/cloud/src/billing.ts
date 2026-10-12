import {
  HttpError,
  boundedText,
  now,
  sha,
  type Env,
  type Principal,
  type WorkspaceRow,
} from "./types.ts";
export const STRIPE_API_VERSION = "2026-09-30.endive";

type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number;
  recurring?: { interval: string; interval_count: number };
};
type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end?: number;
  items: {
    data: {
      quantity: number;
      current_period_end?: number;
      price: { id: string };
    }[];
  };
};
type StripeLink = { id: string; url: string };
export async function stripe<T>(
  env: Env,
  path: string,
  params?: URLSearchParams,
  idempotency?: string,
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY)
    throw new HttpError(503, "Billing is not configured");
  const result = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(params
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    body: params?.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const value = (await result.json()) as T;
  if (!result.ok)
    throw new HttpError(
      502,
      "Stripe is temporarily unavailable; no plan changes were applied",
    );
  return value;
}
export async function checkout(env: Env, principal: Principal) {
  if (!env.STRIPE_PLUS_PRICE_ID)
    throw new HttpError(503, "Plus is not configured yet");
  const price = await stripe<StripePrice>(
    env,
    `prices/${encodeURIComponent(env.STRIPE_PLUS_PRICE_ID)}`,
  );
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== 399 ||
    price.recurring?.interval !== "month" ||
    price.recurring?.interval_count !== 1
  )
    throw new HttpError(
      503,
      "Configured Plus price must be $3.99 USD per month",
    );
  let customer = principal.workspace.customer_id;
  if (!customer) {
    const created = await stripe<{ id: string }>(
      env,
      "customers",
      new URLSearchParams({
        "metadata[workspaceId]": principal.workspace.id,
        "metadata[accountId]": principal.accountId,
      }),
      `base-customer-${await sha(principal.accountId)}`,
    );
    customer = created.id;
    await env.DB.prepare(
      "UPDATE workspaces SET customer_id=? WHERE id=? AND owner_id=? AND customer_id IS NULL",
    )
      .bind(customer, principal.workspace.id, principal.accountId)
      .run();
    const saved = await env.DB.prepare(
      "SELECT customer_id FROM workspaces WHERE id=?",
    )
      .bind(principal.workspace.id)
      .first<{ customer_id: string }>();
    customer = saved!.customer_id;
  }
  const currentSubscriptions = await stripe<{ data: StripeSubscription[] }>(
    env,
    `subscriptions?customer=${encodeURIComponent(customer!)}&status=all&limit=100`,
  );
  if (
    currentSubscriptions.data.some(
      (value) =>
        ["active", "trialing", "past_due"].includes(value.status) &&
        value.items.data.some(
          (item) => item.price.id === env.STRIPE_PLUS_PRICE_ID,
        ),
    )
  )
    return portal(env, {
      ...principal,
      workspace: { ...principal.workspace, customer_id: customer },
    });
  const params = new URLSearchParams({
    mode: "subscription",
    customer: customer!,
    "line_items[0][price]": env.STRIPE_PLUS_PRICE_ID,
    "line_items[0][quantity]": "1",
    client_reference_id: principal.workspace.id,
    "subscription_data[metadata][workspaceId]": principal.workspace.id,
    success_url: `${env.PUBLIC_URL}/billing?result=success`,
    cancel_url: `${env.PUBLIC_URL}/billing?result=cancelled`,
  });
  // A per-workspace durable attempt survives network retries and simultaneous
  // upgrade clicks. Stripe reuses the same Checkout session for that attempt.
  const attempt = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO checkout_attempts(workspace_id,id,expires) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET id=excluded.id,expires=excluded.expires WHERE checkout_attempts.expires<=?",
  )
    .bind(principal.workspace.id, attempt, now() + 86400, now())
    .run();
  const current = await env.DB.prepare(
    "SELECT id,expires FROM checkout_attempts WHERE workspace_id=?",
  )
    .bind(principal.workspace.id)
    .first<{ id: string; expires: number }>();
  params.set("expires_at", String(current!.expires));
  const session = await stripe<StripeLink>(
    env,
    "checkout/sessions",
    params,
    `base-checkout-${principal.workspace.id}-${current!.id}`,
  );
  return { url: session.url };
}
export async function portal(env: Env, principal: Principal) {
  if (!principal.workspace.customer_id)
    throw new HttpError(409, "No subscription account exists yet");
  const value = await stripe<StripeLink>(
    env,
    "billing_portal/sessions",
    new URLSearchParams({
      customer: principal.workspace.customer_id,
      return_url: `${env.PUBLIC_URL}/billing`,
    }),
  );
  return { url: value.url };
}
export async function verifyStripeSignature(
  raw: string,
  header: string | null,
  secret: string,
  at = now(),
) {
  if (!header) throw new HttpError(400, "Webhook signature missing");
  const fields = header.split(",").map((part) => part.split("=")),
    timestamp = fields.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(at - Number(timestamp)) > 300
  )
    throw new HttpError(400, "Webhook expired");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  for (const [name, signature] of fields) {
    if (name !== "v1" || !/^[a-f0-9]{64}$/.test(signature ?? "")) continue;
    const bytes = Uint8Array.from(signature.match(/../g)!, (v) =>
      parseInt(v, 16),
    );
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        new TextEncoder().encode(`${timestamp}.${raw}`),
      )
    )
      return;
  }
  throw new HttpError(400, "Invalid webhook signature");
}
export async function webhook(env: Env, request: Request) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PLUS_PRICE_ID)
    throw new HttpError(503, "Billing webhook is not configured");
  const raw = await boundedText(request, 1_000_000);
  await verifyStripeSignature(
    raw,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );
  const event = JSON.parse(raw);
  if (
    typeof event.id !== "string" ||
    !event.id.startsWith("evt_") ||
    event.livemode !== (env.ENVIRONMENT === "production")
  )
    throw new HttpError(400, "Webhook environment mismatch");
  const received = await env.DB.prepare(
    "SELECT status FROM webhook_events WHERE id=?",
  )
    .bind(event.id)
    .first<{ status: string }>();
  if (received?.status === "done") return { ok: true };
  await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_events VALUES(?,?,'pending')",
  )
    .bind(event.id, now())
    .run();
  const object = event.data?.object;
  const subscriptionId = event.type?.startsWith("customer.subscription.")
    ? object?.id
    : (object?.subscription ??
      object?.parent?.subscription_details?.subscription);
  if (
    typeof subscriptionId === "string" &&
    subscriptionId.startsWith("sub_") &&
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
    ].includes(event.type)
  ) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const customer =
        typeof object.customer === "string"
          ? object.customer
          : object.customer?.id;
      if (typeof customer !== "string" || !customer.startsWith("cus_"))
        throw new HttpError(400, "Billing customer missing");
      // Read the local version BEFORE the authoritative provider request. A slow
      // older response cannot acquire a newer version after another webhook wins.
      const workspace = await env.DB.prepare(
        "SELECT * FROM workspaces WHERE customer_id=?",
      )
        .bind(customer)
        .first<WorkspaceRow>();
      if (!workspace)
        throw new HttpError(
          409,
          "Billing customer has not been provisioned; retry this webhook",
        );
      const observed = await stripe<StripeSubscription>(
        env,
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
      );
      const subscriptions = await stripe<{ data: StripeSubscription[] }>(
        env,
        `subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`,
      );
      // A late cancellation for an older subscription must not remove a newer,
      // still-paid Plus subscription for this same customer.
      const subscription =
        subscriptions.data.find(
          (value) =>
            ["active", "trialing"].includes(value.status) &&
            value.items.data.length === 1 &&
            value.items.data[0].price.id === env.STRIPE_PLUS_PRICE_ID &&
            value.items.data[0].quantity === 1 &&
            Number(
              value.items.data[0].current_period_end ??
                value.current_period_end ??
                0,
            ) > now(),
        ) ?? observed;
      const owner =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;
      if (owner !== customer)
        throw new HttpError(400, "Subscription customer mismatch");
      const item = subscription.items?.data?.[0];
      const correctPrice =
        subscription.items?.data?.length === 1 &&
        item?.price?.id === env.STRIPE_PLUS_PRICE_ID &&
        item.quantity === 1;
      const paidUntil = Number(
          item?.current_period_end ?? subscription.current_period_end ?? 0,
        ),
        status = String(subscription.status);
      const plan =
        correctPrice &&
        ["active", "trialing"].includes(status) &&
        paidUntil > now()
          ? "plus"
          : "free";
      // CAS prevents an earlier, slower webhook overwriting a newer observation.
      const updated = await env.DB.prepare(
        "UPDATE workspaces SET plan=?,subscription_id=?,subscription_status=?,paid_until=?,billing_version=billing_version+1 WHERE id=? AND customer_id=? AND billing_version=?",
      )
        .bind(
          plan,
          subscription.id,
          status,
          paidUntil,
          workspace.id,
          customer,
          workspace.billing_version,
        )
        .run();
      if (updated.meta.changes === 1) break;
      if (attempt === 5)
        throw new HttpError(409, "Billing changed concurrently; retry");
    }
  }
  await env.DB.prepare("UPDATE webhook_events SET status='done' WHERE id=?")
    .bind(event.id)
    .run();
  return { ok: true };
}
