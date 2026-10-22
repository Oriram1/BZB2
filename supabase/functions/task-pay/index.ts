/**
 * The task owner's side of paying for a task.
 *
 *   retry     charge the saved card again for a task waiting on payment
 *   new_card  open Cardcom's page to pay that task with a different card
 *   wallet    charge once without saving a card (wallet-compatible hosted page)
 *   bit       charge once using Cardcom's Bit URL, if enabled on the terminal
 *   card_setup open Cardcom's page to save a card without charging (needed
 *              before a paid task can be submitted for review)
 *
 * The amount is always the task's own payment_due, set by the database when the
 * task was submitted; nothing about the price comes from the request.
 */
import { authenticatedClients, errorResponse, hasRole, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { siteUrl } from "../_shared/email.ts";
import { billingEnabled, createLowProfile } from "../_shared/cardcom.ts";
import { chargeTask } from "../_shared/taskBilling.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTEMPTS_PER_HOUR = 5;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!billingEnabled()) return json({ error: "billing_disabled" }, 503);

    const body = await readJsonObject(req);
    const action = String(body.action ?? "");
    if (!["retry", "new_card", "wallet", "bit", "card_setup", "update_card"].includes(action)) return json({ error: "invalid_action" }, 400);

    if (action === "update_card") {
      const { data: subscription, error } = await admin.from("subscriptions")
        .select("status").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!subscription || !["active", "past_due"].includes(subscription.status)) {
        return json({ error: "no_active_subscription" }, 409);
      }
    } else if (!(await hasRole(admin, user.id, "tasker"))) {
      return json({ error: "tasker_only" }, 403);
    }

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from("billing_charges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR * 3) return json({ error: "too_many_attempts" }, 429);

    const base = siteUrl();
    const functionsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-webhook`;

    if (action === "card_setup" || action === "update_card") {
      const id = crypto.randomUUID();
      const { error } = await admin.from("billing_charges").insert({
        id,
        user_id: user.id,
        purpose: "card_setup",
        amount: 0,
        meta: action === "update_card" ? { card_update: true } : {},
      });
      if (error) throw error;
      return await openPage(admin, id, {
        amount: 0,
        operation: "CreateTokenOnly",
        productName: action === "update_card" ? "החלפת כרטיס אשראי - ללא חיוב" : "שמירת כרטיס אשראי",
        returnUrl: (result) => `${base}/billing/return?charge=${id}&result=${result}${action === "update_card" ? "&flow=card-update" : ""}`,
        webhookUrl: functionsUrl,
        email: user.email ?? undefined,
      });
    }

    const taskId = String(body.task_id ?? "");
    if (!UUID.test(taskId)) return json({ error: "invalid_task" }, 400);
    const { data: task } = await admin
      .from("tasks")
      .select("id, creator_id, name, payment_due, publish_state")
      .eq("id", taskId)
      .eq("creator_id", user.id)
      .maybeSingle();
    if (!task) return json({ error: "not_found" }, 404);
    if (!["pending_payment", "awaiting_charge"].includes(task.publish_state)) {
      return json({ error: "not_waiting_for_payment", state: task.publish_state }, 409);
    }

    if (action === "retry") {
      const outcome = await chargeTask(admin, task.id);
      const { data: after } = await admin.from("tasks").select("publish_state").eq("id", task.id).single();
      return json({ state: after?.publish_state, charge: outcome.status });
    }

    const oneTime = action === "wallet" || action === "bit";
    // One-time methods never create or replace a recurring card.
    const id = crypto.randomUUID();
    const { error } = await admin.from("billing_charges").insert({
      id,
      user_id: user.id,
      purpose: "task",
      task_id: task.id,
      amount: task.payment_due,
      meta: oneTime ? { payment_mode: "one_time" } : {},
    });
    if (error) throw error;
    return await openPage(admin, id, {
      amount: Number(task.payment_due),
      bit: action === "bit",
      operation: oneTime ? "ChargeOnly" : "ChargeAndCreateToken",
      productName: `משימה: ${task.name}`,
      returnUrl: (result) => `${base}/billing/return?charge=${id}&result=${result}`,
      webhookUrl: functionsUrl,
      email: user.email ?? undefined,
    });
  } catch (error) {
    return errorResponse(error);
  }
}));

async function openPage(
  admin: Parameters<typeof chargeTask>[0],
  chargeId: string,
  page: {
    amount: number;
    bit?: boolean;
    operation: "ChargeOnly" | "ChargeAndCreateToken" | "CreateTokenOnly";
    productName: string;
    returnUrl: (result: string) => string;
    webhookUrl: string;
    email?: string;
  },
) {
  try {
    const created = await createLowProfile({
      amount: page.amount,
      operation: page.operation,
      returnValue: chargeId,
      productName: page.productName,
      successUrl: page.returnUrl("success"),
      failedUrl: page.returnUrl("failed"),
      cancelUrl: page.returnUrl("cancel"),
      webhookUrl: page.webhookUrl,
      email: page.email,
    });
    const { error: linkError } = await admin.from("billing_charges").update({ low_profile_id: created.lowProfileId }).eq("id", chargeId);
    if (linkError) throw linkError;
    if (page.bit && !created.bitUrl) {
      const { error } = await admin.from("billing_charges").update({ status: "failed", error: "bit_unavailable" }).eq("id", chargeId).eq("status", "pending");
      if (error) throw error;
      return json({ error: "bit_unavailable" }, 409);
    }
    return json({ url: page.bit ? created.bitUrl : created.url, charge_id: chargeId });
  } catch (error) {
    await admin.from("billing_charges").update({ status: "failed", error: "create_failed" }).eq("id", chargeId).eq("status", "pending");
    console.error("task_pay_page_failed", error instanceof Error ? error.message : error);
    return json({ error: "payment_unavailable" }, 502);
  }
}
