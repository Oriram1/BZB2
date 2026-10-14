/**
 * Cancellation with a refund, inside 14 days of paying.
 *
 *   preview   what the user would get back and which tasks they must decide on
 *   confirm   do it
 *
 * The user keeps or drops each task. A task a worker already took cannot be
 * dropped. Every kept task, except the first one ever published, is charged the
 * task fee; that difference is charged BEFORE the refund so nobody can walk away
 * with the refund and free tasks. The refund can be used once per user.
 */
import { authenticatedClients, errorResponse, hasRole, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { billingEnabled, refundTransaction } from "../_shared/cardcom.ts";
import { notifyBilling } from "../_shared/billing.ts";
import { chargeSavedCard } from "../_shared/taskBilling.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (value: number) => Math.round(value * 100) / 100;

type PlanRow = { task_id: string; name: string; locked: boolean; is_first: boolean };

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!billingEnabled()) return json({ error: "billing_disabled" }, 503);
    if (!(await hasRole(admin, user.id, "tasker"))) return json({ error: "tasker_only" }, 403);

    const body = await readJsonObject(req);
    const action = String(body.action ?? "preview");
    if (!["preview", "confirm"].includes(action)) return json({ error: "invalid_action" }, 400);

    const { data: eligibility } = await admin.rpc("cancel_refund_eligibility", { _user_id: user.id });
    const elig = eligibility as { eligible: boolean; reason?: string; order_id?: string; deal_number?: number; amount?: number };
    if (!elig?.eligible) return json({ error: elig?.reason ?? "not_eligible" }, 409);

    const { data: planRows } = await admin.rpc("cancel_task_plan", { _user_id: user.id });
    const tasks = (planRows ?? []) as PlanRow[];
    const { data: feeData } = await admin.rpc("billing_setting_number", { _key: "task_fee", _fallback: 3 });
    const fee = Number(feeData ?? 3);

    if (action === "preview") {
      const chargeable = tasks.filter((task) => !task.is_first).length;
      return json({
        eligible: true,
        refund_amount: elig.amount,
        task_fee: fee,
        tasks: tasks.map((task) => ({ id: task.task_id, name: task.name, locked: task.locked, is_first: task.is_first })),
        difference_if_keep_all: round2(fee * chargeable),
      });
    }

    const requested = Array.isArray(body.delete_task_ids) ? body.delete_task_ids.map(String) : [];
    if (requested.some((id) => !UUID.test(id))) return json({ error: "invalid_task" }, 400);
    // Locked tasks and the first task are never removed, whatever was sent.
    const droppable = new Set(tasks.filter((task) => !task.locked && !task.is_first).map((task) => task.task_id));
    const toDelete = requested.filter((id) => droppable.has(id));
    const kept = tasks.filter((task) => !toDelete.includes(task.task_id));
    const difference = round2(fee * kept.filter((task) => !task.is_first).length);

    let differenceChargeId: string | null = null;
    let differenceDeal: number | null = null;
    if (difference > 0) {
      const outcome = await chargeSavedCard(admin, {
        userId: user.id,
        purpose: "cancel_difference",
        amount: difference,
        description: "חיוב על משימות שנשארו לאחר ביטול המנוי",
        meta: { kept: kept.length },
      });
      if (outcome.status === "failed") return json({ error: "charge_failed", reason: outcome.reason }, 402);
      if (outcome.status !== "paid") return json({ error: "charge_unknown" }, 502);
      differenceChargeId = outcome.chargeId;
      differenceDeal = outcome.details.dealNumber;
      await admin.rpc("billing_charge_paid", {
        _charge_id: outcome.chargeId,
        _deal_number: outcome.details.dealNumber,
        _document_number: outcome.details.documentNumber,
        _document_url: outcome.details.documentUrl,
      });
    }

    const refund = await refundTransaction({ transactionId: Number(elig.deal_number) });
    if (!refund.ok) {
      console.error("billing_cancel_refund_rejected", { userId: user.id, code: refund.code, description: refund.description });
      // Give back the difference we just took, so a failed refund leaves nothing changed.
      if (differenceChargeId && differenceDeal) {
        const undo = await refundTransaction({ transactionId: differenceDeal });
        if (undo.ok) {
          await admin.from("billing_charges").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", differenceChargeId);
        } else {
          console.error("billing_cancel_difference_undo_failed", { userId: user.id, chargeId: differenceChargeId });
        }
      }
      return json({ error: "refund_rejected" }, 502);
    }

    // Only the call that flips paid -> refunded finishes the cancellation.
    const { data: flipped } = await admin
      .from("payment_orders")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", elig.order_id)
      .eq("status", "paid")
      .select("id");
    if (!flipped?.length) return json({ error: "already_refunded" }, 409);

    const { data: applied } = await admin.rpc("apply_refund_cancellation", { _user_id: user.id, _delete_task_ids: toDelete });
    await notifyBilling(admin, user.id, "billing_refunded", {
      amount: elig.amount,
      difference,
      tasks_kept: kept.length,
      tasks_removed: (applied as { removed?: number } | null)?.removed ?? toDelete.length,
    });

    return json({
      status: "refunded",
      refunded: elig.amount,
      difference_charged: difference,
      tasks_kept: kept.length,
      tasks_removed: (applied as { removed?: number } | null)?.removed ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}));
