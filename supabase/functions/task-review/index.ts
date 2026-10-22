/**
 * Admin decision on a task waiting in the review queue.
 *
 * Approve: a free task goes live; a paid task is charged to the owner's saved
 * card now, and goes live only when that charge passes. If the charge fails the
 * task waits (pending_payment) for another card, and the admin sees that state.
 * Reject: nothing is charged and no free slot is used.
 */
import { authenticatedClients, errorResponse, hasRole, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { billingEnabled } from "../_shared/cardcom.ts";
import { notifyBilling } from "../_shared/billing.ts";
import { chargeTask } from "../_shared/taskBilling.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, user.id, "admin"))) return json({ error: "forbidden" }, 403);

    const body = await readJsonObject(req);
    const taskId = String(body.task_id ?? "");
    if (!UUID.test(taskId)) return json({ error: "invalid_task" }, 400);
    if (typeof body.approve !== "boolean") return json({ error: "approve_required" }, 400);
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

    const { data: task } = await admin
      .from("tasks")
      .select("id, creator_id, name, payment_due, publish_state")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return json({ error: "not_found" }, 404);

    // Never move a task toward a charge that cannot be made.
    if (body.approve && Number(task.payment_due) > 0 && !billingEnabled()) {
      return json({ error: "billing_disabled" }, 503);
    }

    const { data: decided, error } = await admin.rpc("task_review_decide", {
      _task_id: taskId,
      _admin_id: user.id,
      _approve: body.approve,
      _note: note,
    });
    if (error) throw error;
    const result = decided as { ok: boolean; error?: string; state?: string; due?: number };
    if (!result.ok) return json({ error: result.error ?? "decision_failed" }, 409);

    if (result.state === "rejected") {
      await notifyBilling(admin, task.creator_id, "task_rejected", { task_id: task.id, task_name: task.name, note }, "/my-tasks?tab=published");
      return json({ state: "rejected" });
    }
    if (result.state === "live") {
      await notifyBilling(admin, task.creator_id, "task_approved", { task_id: task.id, task_name: task.name, amount: 0 }, "/my-tasks?tab=published");
      return json({ state: "live" });
    }

    if (result.state === "pending_payment") {
      await notifyBilling(admin, task.creator_id, "task_payment_failed", {
        task_id: task.id, task_name: task.name, amount: result.due, reason: "manual_payment_required",
      }, "/my-tasks?tab=published");
      return json({ state: "pending_payment", charge: "manual_payment_required" });
    }

    // Approved and due: charge now.
    const outcome = await chargeTask(admin, task.id);
    const { data: after } = await admin.from("tasks").select("publish_state").eq("id", task.id).single();
    return json({ state: after?.publish_state ?? "awaiting_charge", charge: outcome.status });
  } catch (error) {
    return errorResponse(error);
  }
}));
