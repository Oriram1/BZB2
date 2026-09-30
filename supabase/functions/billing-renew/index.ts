/**
 * Hourly billing worker (pg_cron → run_billing_renew). Shared-secret auth, like
 * the other cron-driven functions.
 *
 * One run, in this order:
 *   1. settle stale orders whose outcome we never saw (timeouts, lost webhooks)
 *   2. end subscriptions the user cancelled whose paid period is over
 *   3. charge renewals that are due
 *   4. send "renews soon" reminders
 *
 * Every step is safe to repeat: work is claimed in SQL, charges carry an
 * idempotency key, and reminders are marked in the same statement that finds
 * them.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { requireSecret } from "../_shared/auth.ts";
import { billingEnabled, cardcomConfig, chargeToken, getTransactionByExternalId, type TransactionInfo } from "../_shared/cardcom.ts";
import {
  applyVerdict,
  buildDocument,
  evaluateTransaction,
  loadPlan,
  markOrderFailed,
  notifyBilling,
  planFailure,
  RETRY_OFFSETS_DAYS,
  settleLowProfileOrder,
  type OrderRow,
  type SubscriptionRow,
  type Verdict,
} from "../_shared/billing.ts";

/** pg_net gives this function 55s; stop starting new charges well before that. */
const TIME_BUDGET_MS = 40_000;
const CLAIM_LIMIT = 10;
/** A charge with no answer this long is looked up rather than waited for. */
const STALE_CHARGE_MS = 10 * 60_000;
/** A hosted page nobody finished is dropped after this long. */
const ABANDON_AFTER_MS = 48 * 3_600_000;

const ORDER_COLUMNS = "id, user_id, plan_id, kind, amount, status, low_profile_id, external_uniq_id, deal_number";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** `MMYY` expiry → the last instant the card is valid, in UTC. */
function cardExpired(expiry: string | null | undefined, now = new Date()) {
  if (!expiry || !/^\d{4}$/.test(expiry)) return false;
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  if (month < 1 || month > 12) return false;
  return now.getTime() >= Date.UTC(year, month, 1);
}

/**
 * A renewal attempt failed. Records it and moves the subscription along the
 * retry schedule; the last failure ends it. The `renewal_attempts` guard makes
 * this a no-op if the same failure is recorded twice.
 */
async function recordFailure(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  orderId: string,
  reason: string,
  code: number | null,
) {
  await markOrderFailed(admin, orderId, reason, code);

  const plan = await loadPlan(admin, sub.plan_id);
  const outcome = planFailure(sub.renewal_attempts, new Date(sub.current_period_end));
  const graceEnd = new Date(
    new Date(sub.current_period_end).getTime() + RETRY_OFFSETS_DAYS[RETRY_OFFSETS_DAYS.length - 1] * 86_400_000,
  );

  if (outcome.expired) {
    const { data } = await admin
      .from("subscriptions")
      .update({ status: "expired", next_attempt_at: null, renewal_attempts: sub.renewal_attempts + 1 })
      .eq("id", sub.id)
      .eq("renewal_attempts", sub.renewal_attempts)
      .select("id");
    if (data?.length) {
      await notifyBilling(admin, sub.user_id, "billing_subscription_ended", {
        plan_name: plan?.name,
        reason: "payment_failed",
      });
    }
    return;
  }

  const { data } = await admin
    .from("subscriptions")
    .update({
      status: "past_due",
      renewal_attempts: outcome.attempts,
      next_attempt_at: outcome.nextAttemptAt.toISOString(),
    })
    .eq("id", sub.id)
    .eq("renewal_attempts", sub.renewal_attempts)
    .select("id");
  if (data?.length) {
    await notifyBilling(admin, sub.user_id, "billing_payment_failed", {
      plan_name: plan?.name,
      amount: plan?.amount,
      next_attempt_at: outcome.nextAttemptAt.toISOString(),
      access_until: graceEnd.toISOString(),
      reason: reason === "card_expired" ? "card_expired" : "declined",
    });
  }
}

/** Turns a verdict on a renewal order into subscription state. */
async function settleRenewal(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  order: OrderRow,
  verdict: Verdict,
): Promise<"paid" | "failed" | "pending"> {
  if (verdict.kind === "paid") {
    await applyVerdict(admin, order, verdict.details);
    return "paid";
  }
  if (verdict.kind === "failed") {
    await recordFailure(admin, sub, order.id, verdict.reason, verdict.code);
    return "failed";
  }
  return "pending";
}

async function chargeRenewal(admin: SupabaseClient, sub: SubscriptionRow): Promise<string> {
  const plan = await loadPlan(admin, sub.plan_id);
  if (!plan) return "unknown_plan";

  // Stable per (subscription, period, attempt): a crashed run that comes back
  // to this attempt reuses the same order and the same key, so a charge that
  // did reach Cardcom is found again instead of repeated.
  const externalId = `renew:${sub.id}:${Date.parse(sub.current_period_end)}:${sub.renewal_attempts}`;

  let { data: order } = await admin.from("payment_orders").select(ORDER_COLUMNS).eq("external_uniq_id", externalId).maybeSingle();
  if (!order) {
    const inserted = await admin
      .from("payment_orders")
      .insert({
        user_id: sub.user_id,
        plan_id: plan.id,
        kind: "renewal",
        amount: plan.amount,
        external_uniq_id: externalId,
        for_period_end: sub.current_period_end,
      })
      .select(ORDER_COLUMNS)
      .single();
    if (inserted.error) {
      if (inserted.error.code !== "23505") throw inserted.error;
      order = (await admin.from("payment_orders").select(ORDER_COLUMNS).eq("external_uniq_id", externalId).single()).data;
    } else {
      order = inserted.data;
    }
  }
  if (!order) return "no_order";
  const orderRow = order as OrderRow;
  if (orderRow.status === "paid" || orderRow.status === "refunded") return orderRow.status;
  if (orderRow.status === "failed") {
    await recordFailure(admin, sub, orderRow.id, "declined", null);
    return "failed";
  }

  const { data: method } = await admin
    .from("payment_methods")
    .select("token, card_expiry")
    .eq("user_id", sub.user_id)
    .maybeSingle();
  if (!method?.token) {
    await recordFailure(admin, sub, orderRow.id, "no_payment_method", null);
    return "failed";
  }
  if (cardExpired(method.card_expiry)) {
    await recordFailure(admin, sub, orderRow.id, "card_expired", null);
    return "failed";
  }

  let name: string | null = null;
  let email: string | null = null;
  if (cardcomConfig().issueDocuments) {
    const { data: profile } = await admin.from("profiles").select("first_name, last_name").eq("user_id", sub.user_id).maybeSingle();
    name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || null;
    email = (await admin.auth.admin.getUserById(sub.user_id)).data.user?.email ?? null;
  }

  let info: TransactionInfo;
  try {
    info = await chargeToken({
      token: method.token,
      expiryMMYY: method.card_expiry ?? "",
      amount: Number(orderRow.amount),
      externalUniqTranId: externalId,
      document: buildDocument({ planName: plan.name, amount: orderRow.amount, orderId: orderRow.id, name, email }),
    });
  } catch (error) {
    // Timeout or network error: the charge may or may not have happened. Leave
    // the order pending; the reconcile step asks Cardcom for the truth.
    console.error("billing_charge_unknown", { orderId: orderRow.id, error: error instanceof Error ? error.message : error });
    return "unknown";
  }

  let verdict = evaluateTransaction(info, orderRow);
  if (verdict.kind === "duplicate") {
    verdict = evaluateTransaction(await getTransactionByExternalId(externalId), orderRow);
  }
  return await settleRenewal(admin, sub, orderRow, verdict);
}

async function reconcileStaleOrders(admin: SupabaseClient) {
  let settled = 0;

  // Renewals whose answer never arrived.
  const staleBefore = new Date(Date.now() - STALE_CHARGE_MS).toISOString();
  const { data: renewals } = await admin
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("status", "pending")
    .eq("kind", "renewal")
    .lt("created_at", staleBefore)
    .limit(20);

  for (const order of (renewals ?? []) as OrderRow[]) {
    try {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, user_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end, renewal_attempts, next_attempt_at")
        .eq("user_id", order.user_id)
        .maybeSingle();
      if (!sub || !order.external_uniq_id) continue;
      const verdict = evaluateTransaction(await getTransactionByExternalId(order.external_uniq_id), order);
      await settleRenewal(admin, sub as SubscriptionRow, order, verdict);
      settled += 1;
    } catch (error) {
      console.error("billing_reconcile_failed", { orderId: order.id, error: error instanceof Error ? error.message : error });
    }
  }

  // Hosted pages nobody finished. Ask once more before giving up: a customer
  // who paid late must not be left with a charge and no subscription.
  const abandonBefore = new Date(Date.now() - ABANDON_AFTER_MS).toISOString();
  const { data: pages } = await admin
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("status", "pending")
    .eq("kind", "initial")
    .lt("created_at", abandonBefore)
    .limit(20);

  for (const order of (pages ?? []) as OrderRow[]) {
    try {
      const { status } = await settleLowProfileOrder(admin, order);
      if (status === "pending") await markOrderFailed(admin, order.id, "abandoned", null);
    } catch (error) {
      console.error("billing_abandon_failed", { orderId: order.id, error: error instanceof Error ? error.message : error });
    }
  }

  return settled;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try { requireSecret(req, "NOTIFY_DISPATCH_SECRET"); } catch { return json({ error: "unauthorized" }, 401); }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);
  // Nothing to do while billing is off: no subscriptions exist to renew.
  if (!billingEnabled()) return json({ ok: true, skipped: "billing_disabled" });
  try { cardcomConfig(); } catch { return json({ error: "cardcom_not_configured" }, 500); }

  const admin = createClient(supabaseUrl, serviceKey);
  const started = Date.now();
  const summary = { reconciled: 0, ended: 0, charged: 0, failed: 0, unknown: 0, reminders: 0 };

  summary.reconciled = await reconcileStaleOrders(admin);

  const { data: ended } = await admin.rpc("billing_finish_canceled");
  for (const sub of (ended ?? []) as SubscriptionRow[]) {
    const plan = await loadPlan(admin, sub.plan_id);
    await notifyBilling(admin, sub.user_id, "billing_subscription_ended", { plan_name: plan?.name, reason: "canceled" });
    summary.ended += 1;
  }

  const { data: due, error: claimError } = await admin.rpc("billing_claim_due_renewals", { _limit: CLAIM_LIMIT });
  if (claimError) throw claimError;
  for (const sub of (due ?? []) as SubscriptionRow[]) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const outcome = await chargeRenewal(admin, sub);
      if (outcome === "paid") summary.charged += 1;
      else if (outcome === "failed") summary.failed += 1;
      else summary.unknown += 1;
    } catch (error) {
      // One bad subscription must not stop the rest. Its claim lapses in an
      // hour and it is picked up again.
      console.error("billing_renew_failed", { subscriptionId: sub.id, error: error instanceof Error ? error.message : error });
    }
  }

  const { data: reminders } = await admin.rpc("billing_claim_reminders");
  for (const row of (reminders ?? []) as { user_id: string; plan_name: string; amount: number; current_period_end: string }[]) {
    await notifyBilling(admin, row.user_id, "billing_renewal_reminder", {
      plan_name: row.plan_name,
      amount: row.amount,
      renews_at: row.current_period_end,
    });
    summary.reminders += 1;
  }

  return json({ ok: true, ...summary });
});
