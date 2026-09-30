/**
 * Cancel (or un-cancel) a subscription, any time, from inside the app.
 *
 * Cancelling stops the renewal; the paid period stays usable until it ends and
 * nothing is refunded pro rata. A subscription already in its retry window has
 * no paid time left to honour, so it ends immediately.
 */
import { authenticatedClients, errorResponse, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { loadPlan, notifyBilling } from "../_shared/billing.ts";

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    const body = await readJsonObject(req);
    const resume = body.resume === true;

    const { data: sub } = await admin
      .from("subscriptions")
      .select("id, plan_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sub || (sub.status !== "active" && sub.status !== "past_due")) {
      return json({ error: "no_active_subscription" }, 404);
    }

    if (resume) {
      // Only while the paid period is still running; after that the customer
      // starts a new purchase, which also collects a fresh consent.
      if (sub.status !== "active" || !sub.cancel_at_period_end || new Date(sub.current_period_end) <= new Date()) {
        return json({ error: "cannot_resume" }, 409);
      }
      await admin
        .from("subscriptions")
        .update({ cancel_at_period_end: false, canceled_at: null })
        .eq("id", sub.id);
      return json({ status: "active", cancel_at_period_end: false });
    }

    // Idempotent: cancelling twice must not send two confirmations.
    if (sub.cancel_at_period_end) {
      return json({ status: sub.status, cancel_at_period_end: true, ends_at: sub.current_period_end });
    }

    const endsNow = sub.status === "past_due";
    await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        ...(endsNow ? { status: "canceled", next_attempt_at: null } : {}),
      })
      .eq("id", sub.id);

    const plan = await loadPlan(admin, sub.plan_id);
    await notifyBilling(admin, user.id, "billing_subscription_canceled", {
      plan_name: plan?.name,
      ends_at: endsNow ? new Date().toISOString() : sub.current_period_end,
    });

    return json({
      status: endsNow ? "canceled" : sub.status,
      cancel_at_period_end: true,
      ends_at: endsNow ? new Date().toISOString() : sub.current_period_end,
    });
  } catch (error) {
    return errorResponse(error);
  }
}));
