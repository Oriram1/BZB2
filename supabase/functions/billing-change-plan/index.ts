/**
 * Switch between the quarterly and the annual plan.
 *
 *   to a longer plan   immediate. The time left on the current plan is credited
 *                      against the new price and only the difference is
 *                      charged to the saved card. No cash back, ever.
 *   to a shorter plan  scheduled for the end of the current period; nothing is
 *                      charged or refunded now.
 *   during the free month the plan simply changes; nothing has been paid yet.
 */
import { authenticatedClients, errorResponse, hasRole, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { billingEnabled } from "../_shared/cardcom.ts";
import { loadPlan, notifyBilling } from "../_shared/billing.ts";
import { chargeSavedCard } from "../_shared/taskBilling.ts";
import { PlanIntegrityError } from "../_shared/planPrice.ts";

const round2 = (value: number) => Math.round(value * 100) / 100;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!billingEnabled()) return json({ error: "billing_disabled" }, 503);
    if (!(await hasRole(admin, user.id, "tasker"))) return json({ error: "tasker_only" }, 403);

    const body = await readJsonObject(req);
    const planId = String(body.plan_id ?? "");

    const { data: sub } = await admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
    if (!sub || sub.status !== "active") return json({ error: "no_active_subscription" }, 409);

    if (planId === sub.plan_id) {
      // Choosing the current plan cancels a scheduled change.
      if (sub.pending_plan_id) {
        await admin.from("subscriptions").update({ pending_plan_id: null }).eq("id", sub.id);
        return json({ status: "schedule_cleared" });
      }
      return json({ error: "same_plan" }, 409);
    }

    let target: Awaited<ReturnType<typeof loadPlan>>;
    try {
      target = await loadPlan(admin, planId);
    } catch (error) {
      if (error instanceof PlanIntegrityError) return json({ error: "price_integrity_error" }, 503);
      throw error;
    }
    if (!target || !target.active) return json({ error: "unknown_plan" }, 400);
    const current = await loadPlan(admin, sub.plan_id, { verify: false });
    if (!current) return json({ error: "unknown_plan" }, 400);

    const longer = target.period_months > current.period_months;

    // Free month: nothing paid, so nothing to credit or charge.
    if (sub.is_trial) {
      await admin.from("subscriptions").update({ plan_id: target.id, pending_plan_id: null }).eq("id", sub.id);
      return json({ status: "changed", charged: 0 });
    }

    if (!longer) {
      await admin.from("subscriptions").update({ pending_plan_id: target.id }).eq("id", sub.id);
      await notifyBilling(admin, user.id, "billing_plan_changed", {
        kind: "scheduled",
        from: current.name,
        to: target.name,
        effective: sub.current_period_end,
      });
      return json({ status: "scheduled", effective: sub.current_period_end });
    }

    const start = new Date(sub.current_period_start).getTime();
    const end = new Date(sub.current_period_end).getTime();
    const remaining = Math.max(0, end - Date.now());
    const credit = round2(Number(current.amount) * (end > start ? remaining / (end - start) : 0));
    const due = round2(Number(target.amount) - credit);

    let chargeId: string | null = null;
    if (due > 0) {
      const outcome = await chargeSavedCard(admin, {
        userId: user.id,
        purpose: "plan_change",
        amount: due,
        planId: target.id,
        description: `מעבר למנוי ${target.name}`,
        meta: { from: current.id, credit },
      });
      if (outcome.status === "failed") return json({ error: "charge_failed", reason: outcome.reason }, 402);
      if (outcome.status !== "paid") return json({ error: "charge_unknown" }, 502);
      chargeId = outcome.chargeId;
      await admin.rpc("billing_charge_paid", {
        _charge_id: outcome.chargeId,
        _deal_number: outcome.details.dealNumber,
        _document_number: outcome.details.documentNumber,
        _document_url: outcome.details.documentUrl,
      });
    }

    const { data: applied } = await admin.rpc("apply_plan_upgrade", { _user_id: user.id, _plan_id: target.id });
    const result = applied as { applied?: boolean; period_end?: string } | null;
    if (!result?.applied) {
      console.error("billing_plan_upgrade_not_applied", { userId: user.id, chargeId });
      return json({ error: "upgrade_not_applied" }, 409);
    }

    await notifyBilling(admin, user.id, "billing_plan_changed", {
      kind: "upgraded",
      from: current.name,
      to: target.name,
      amount: due > 0 ? due : 0,
      credit,
      period_end: result.period_end,
    });
    return json({ status: "upgraded", charged: due > 0 ? due : 0, credit, period_end: result.period_end });
  } catch (error) {
    return errorResponse(error);
  }
}));
