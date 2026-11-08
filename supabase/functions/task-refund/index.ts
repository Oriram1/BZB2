/**
 * Refunds the fee of paid tasks that were deleted or rejected.
 *
 * Called every 10 minutes by pg_cron (shared-secret auth, like billing-renew),
 * and right after an admin deletes a task (the admin's own session). Anyone
 * else is refused. It touches only requests the database queued.
 */
import { authenticatedClients, hasRole, json, rejectWithoutSecret, serviceClient, servePost } from "../_shared/auth.ts";
import { billingEnabled, refundTransaction } from "../_shared/cardcom.ts";
import { notifyBilling } from "../_shared/billing.ts";
import { processTaskRefunds } from "../_shared/taskRefund.ts";

servePost(async (req) => {
  let admin;
  if (req.headers.get("x-notify-secret")) {
    const denied = rejectWithoutSecret(req);
    if (denied) return denied;
    admin = serviceClient();
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
});
