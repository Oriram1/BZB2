/**
 * Called by the return page after Cardcom redirects the customer back.
 *
 * The redirect is only a hint: the customer's browser could say "success" for
 * anything. So this asks Cardcom directly, the same way the webhook does, and
 * reports what the database now says. Whichever of the two arrives first wins;
 * the other finds the order already settled.
 */
import { authenticatedClients, json, readJsonObject, servePost, isUuid } from "../_shared/auth.ts";
import { ORDER_COLUMNS, settleLowProfileOrder, type OrderRow } from "../_shared/billing.ts";
import { CHARGE_COLUMNS, settleChargePage, type ChargeRow } from "../_shared/taskBilling.ts";
import { paymentFailureReason } from "../_shared/paymentFailure.ts";

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  const body = await readJsonObject(req);
  // A task or card-setup page is a charge, not a subscription order.
  if (body.charge_id !== undefined) {
    const chargeId = String(body.charge_id);
    if (!isUuid(chargeId)) return json({ error: "invalid_charge" }, 400);
    const { data: charge } = await admin
      .from("billing_charges")
      .select(CHARGE_COLUMNS)
      .eq("id", chargeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!charge) return json({ error: "not_found" }, 404);
    const settled = await settleChargePage(admin, charge as ChargeRow);
    if (settled.status === "failed") {
      const { data: failure, error } = await admin.from("billing_charges").select("error,response_code").eq("id", chargeId).single();
      if (error) throw error;
      return json({ ...settled, failureReason: paymentFailureReason(failure) });
    }
    return json(settled);
  }

  const orderId = String(body.order_id ?? "");
  if (!isUuid(orderId)) return json({ error: "invalid_order" }, 400);

  // Scoped to the caller: someone else's order id reads as not found.
  const { data: order } = await admin
    .from("payment_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) return json({ error: "not_found" }, 404);

  const { status } = await settleLowProfileOrder(admin, order as OrderRow);
  if (status === "failed") {
    const { data: failure, error } = await admin.from("payment_orders").select("error,response_code").eq("id", orderId).single();
    if (error) throw error;
    return json({ status, failureReason: paymentFailureReason(failure) });
  }
  return json({ status });
});
