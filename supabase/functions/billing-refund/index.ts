/**
 * Admin-only refund of a paid order.
 *
 * Refunding ends the subscription the order bought: the money is gone, so the
 * access it paid for goes with it. Cardcom is asked first; nothing changes in
 * our database unless Cardcom confirms the refund.
 */
import { authenticatedClients, errorResponse, hasRole, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { refundTransaction } from "../_shared/cardcom.ts";
import { notifyBilling } from "../_shared/billing.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, user.id, "admin"))) return json({ error: "forbidden" }, 403);

    const body = await readJsonObject(req);
    const orderId = String(body.order_id ?? "");
    if (!UUID.test(orderId)) return json({ error: "invalid_order" }, 400);

    const { data: order } = await admin
      .from("payment_orders")
      .select("id, user_id, plan_id, amount, status, deal_number")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ error: "not_found" }, 404);
    if (order.status !== "paid" || !order.deal_number) return json({ error: "not_refundable" }, 409);

    const refund = await refundTransaction({ transactionId: Number(order.deal_number) });
    if (!refund.ok) {
      console.error("billing_refund_rejected", { orderId, code: refund.code, description: refund.description });
      return json({ error: "refund_rejected", description: refund.description ?? null }, 502);
    }

    // The conditional update is the guard against a double click: only the
    // call that flips paid → refunded goes on to end the subscription.
    const { data: flipped } = await admin
      .from("payment_orders")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "paid")
      .select("id");

    if (flipped?.length) {
      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: true,
          canceled_at: new Date().toISOString(),
          next_attempt_at: null,
        })
        .eq("user_id", order.user_id)
        .in("status", ["active", "past_due"]);

      await notifyBilling(admin, order.user_id, "billing_refunded", { amount: order.amount });
    }

    return json({ status: "refunded" });
  } catch (error) {
    return errorResponse(error);
  }
}));
