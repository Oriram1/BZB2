/**
 * Returns the fee of a paid task whose task was deleted or rejected.
 *
 * The database queues a request when that happens (`task_refunds`). This claims
 * each request before asking Cardcom, so two overlapping runs cannot refund the
 * same task twice, and records the outcome. A request interrupted after the
 * claim stays `started` for a person to reconcile; retrying it blindly could
 * refund twice.
 *
 * Cardcom and the notification are passed in, so the money logic can be tested
 * without either.
 */
/** The slice of the Supabase client used here, so tests can stand in for it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export type RefundResult = { ok: boolean; code?: number; description?: string };

export type RefundDeps = {
  refund: (params: { transactionId: number }) => Promise<RefundResult>;
  notify: (userId: string, data: { task_id: string; task_name: string | null; amount: number }) => Promise<void>;
};

type Claimed = {
  id: string;
  user_id: string;
  task_id: string;
  task_name: string | null;
  amount: number | string;
  charges: { id: string; amount: number | string; deal_number: number | string }[];
};

export type RefundSummary = { refunded: number; failed: number; skipped: number };

export async function processTaskRefunds(
  admin: Admin,
  deps: RefundDeps,
  limit = 10,
): Promise<RefundSummary> {
  const summary: RefundSummary = { refunded: 0, failed: 0, skipped: 0 };

  const { data: open, error } = await admin
    .from("task_refunds")
    .select("id")
    .eq("status", "requested")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  for (const row of (open ?? []) as { id: string }[]) {
    const { data: claimedData, error: claimError } = await admin.rpc("task_refund_claim", { _refund_id: row.id });
    if (claimError) throw claimError;
    const claimed = claimedData as Claimed | null;
    if (!claimed) {
      summary.skipped++;
      continue;
    }

    let failure: RefundResult | null = null;
    for (const charge of claimed.charges) {
      const result = await deps.refund({ transactionId: Number(charge.deal_number) });
      if (!result.ok) {
        failure = result;
        break;
      }
      await admin.rpc("task_refund_charge_done", { _charge_id: charge.id });
    }

    if (failure || claimed.charges.length === 0) {
      await admin.rpc("task_refund_finish", {
        _refund_id: claimed.id,
        _ok: false,
        _code: failure?.code ?? null,
        _error: failure?.description ?? "no_refundable_charge",
      });
      summary.failed++;
      continue;
    }

    await admin.rpc("task_refund_finish", { _refund_id: claimed.id, _ok: true, _code: 0, _error: null });
    await deps.notify(claimed.user_id, {
      task_id: claimed.task_id,
      task_name: claimed.task_name,
      amount: Number(claimed.amount),
    });
    summary.refunded++;
  }
  return summary;
}
