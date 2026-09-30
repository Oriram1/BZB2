/**
 * Called by the return page after Cardcom redirects the customer back.
 *
 * The redirect is only a hint: the customer's browser could say "success" for
 * anything. So this asks Cardcom directly, the same way the webhook does, and
 * reports what the database now says. Whichever of the two arrives first wins;
 * the other finds the order already settled.
 */
import { authenticatedClients, errorResponse, json, readJsonObject, withCors } from "../_shared/auth.ts";
import { settleLowProfileOrder, type OrderRow } from "../_shared/billing.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    const body = await readJsonObject(req);
    const orderId = String(body.order_id ?? "");
    if (!UUID.test(orderId)) return json({ error: "invalid_order" }, 400);

    // Scoped to the caller: someone else's order id reads as not found.
    const { data: order } = await admin
      .from("payment_orders")
      .select("id, user_id, plan_id, kind, amount, status, low_profile_id, external_uniq_id, deal_number")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!order) return json({ error: "not_found" }, 404);

    const { status } = await settleLowProfileOrder(admin, order as OrderRow);
    return json({ status });
  } catch (error) {
    return errorResponse(error);
  }
}));
