/**
 * Starts a subscription purchase: creates the order, asks Cardcom for a hosted
 * payment page and returns its URL.
 *
 * The amount comes from billing_plans, never from the request, and the card is
 * only ever typed into Cardcom's page, so no card data touches this server.
 */
import { authenticatedClients, json, readJsonObject, servePost } from "../_shared/auth.ts";
import { siteUrl } from "../_shared/email.ts";
import { createLowProfile } from "../_shared/cardcom.ts";
import { buildDocument, markOrderFailed } from "../_shared/billing.ts";
import { billingGate, loadPlanOrReply } from "../_shared/billingGuards.ts";
import { HOUR_MS, MAX_PENDING_ORDERS_PER_HOUR } from "../_shared/billingPolicy.ts";

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  // Only people who post tasks buy a plan.
  const gated = await billingGate(admin, user.id, "tasker");
  if (gated) return gated;

  const body = await readJsonObject(req);
  // Renewal is automatic, so the customer must have seen and accepted that
  // before any card is charged. The UI sends this only from its consent box.
  if (body.accept_renewal !== true) return json({ error: "consent_required" }, 400);

  const { data: existing } = await admin
    .from("subscriptions")
    .select("status, plan_id, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.status === "active") return json({ error: "already_subscribed" }, 409);

  // A subscription in its retry window is not a second purchase: it pays the
  // overdue renewal, on whatever card the customer now enters, and the new
  // card becomes the saved one. The plan is the one they already have.
  const overdue = existing?.status === "past_due" ? existing : null;
  const loaded = await loadPlanOrReply(admin, overdue ? overdue.plan_id : String(body.plan_id ?? ""));
  if (loaded.reply) return loaded.reply;
  const plan = loaded.plan;

  // Stops one account from minting hosted pages (each is a Cardcom API call).
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { count } = await admin
    .from("payment_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PENDING_ORDERS_PER_HOUR) return json({ error: "too_many_attempts" }, 429);

  const { data: order, error: orderError } = await admin
    .from("payment_orders")
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      kind: overdue ? "renewal" : "initial",
      amount: plan.amount,
      // Lets apply_paid_order tell if the cron already collected this period.
      for_period_end: overdue ? overdue.current_period_end : null,
    })
    .select("id")
    .single();
  if (orderError || !order) throw orderError ?? new Error("order_insert_failed");

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  const base = siteUrl();
  const returnUrl = (result: string) => `${base}/billing/return?order=${order.id}&result=${result}`;
  const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-webhook`;

  try {
    const page = await createLowProfile({
      amount: Number(plan.amount),
      returnValue: order.id,
      productName: `מנוי BZB – ${plan.name}`,
      successUrl: returnUrl("success"),
      failedUrl: returnUrl("failed"),
      cancelUrl: returnUrl("cancel"),
      webhookUrl: functionsUrl,
      email: user.email ?? undefined,
      document: buildDocument({ planName: plan.name, amount: plan.amount, orderId: order.id, name, email: user.email }),
    });

    await admin.from("payment_orders").update({ low_profile_id: page.lowProfileId }).eq("id", order.id);
    return json({ url: page.url, order_id: order.id });
  } catch (error) {
    await markOrderFailed(admin, order.id, "create_failed", null);
    console.error("billing_checkout_failed", error instanceof Error ? error.message : error);
    return json({ error: "payment_unavailable" }, 502);
  }
});
