/**
 * Refunds the fee of paid tasks that were deleted or rejected.
 *
 * Called every 10 minutes by pg_cron (shared-secret auth, like billing-renew),
 * and right after an admin deletes a task (the admin's own session). Anyone
 * else is refused. It touches only requests the database queued.
 */
import { authenticatedClients, errorResponse, hasRole, json, requireSecret, withCors } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { billingEnabled, refundTransaction } from "../_shared/cardcom.ts";
import { notifyBilling } from "../_shared/billing.ts";
import { processTaskRefunds } from "../_shared/taskRefund.ts";

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let admin;
    if (req.headers.get("x-notify-secret")) {
      try { requireSecret(req, "NOTIFY_DISPATCH_SECRET"); } catch { return json({ error: "unauthorized" }, 401); }
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);
      admin = createClient(supabaseUrl, serviceKey);
    } else {
      const clients = await authenticatedClients(req);
      if (!(await hasRole(clients.admin, clients.user.id, "admin"))) return json({ error: "forbidden" }, 403);
      admin = clients.admin;
    }

    if (!billingEnabled()) return json({ error: "billing_disabled" }, 503);

    const summary = await processTaskRefunds(admin, {
      refund: refundTransaction,
      notify: (userId, data) => notifyBilling(admin, userId, "task_refunded", data, "/my-tasks?tab=published"),
    });
    return json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}));
