/** Stable, non-sensitive failure categories; never expose raw provider text. */
export function paymentFailureReason(row: { error?: string | null; response_code?: number | null } | null) {
  if (!row) return "unknown";
  if (["order_mismatch", "terminal_mismatch", "amount_mismatch"].includes(row.error ?? "")) return "verification_failed";
  if (["create_failed", "network_error"].includes(row.error ?? "")) return "provider_unavailable";
  if (row.response_code !== null && row.response_code !== undefined && row.response_code !== 0) return "card_declined";
  return "unknown";
}
