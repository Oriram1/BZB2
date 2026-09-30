import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260930100100_billing.sql");
const eventsMigration = read("supabase/migrations/20260930100000_billing_notification_events.sql");

describe("billing invariants", () => {
  it("keeps Cardcom's unauthenticated callbacks off the gateway JWT and everything else on it", () => {
    const config = read("supabase/config.toml");
    // Cardcom sends no JWT, so these two cannot use gateway verification. They
    // authenticate another way (see the next two tests), not by being open.
    expect(config).toContain("[functions.billing-webhook]\nverify_jwt = false");
    expect(config).toContain("[functions.billing-renew]\nverify_jwt = false");
    for (const name of ["billing-create-checkout", "billing-confirm", "billing-cancel", "billing-refund"]) {
      expect(config, name).toContain(`[functions.${name}]\nverify_jwt = true`);
    }
  });

  it("never lets the webhook grant a subscription from what the request claims", () => {
    const webhook = read("supabase/functions/billing-webhook/index.ts");
    // It may only look up an order and ask Cardcom; granting is one shared path.
    expect(webhook).toContain("settleLowProfileOrder");
    expect(webhook).not.toContain("apply_paid_order");
    expect(webhook).not.toContain("applyVerdict");
    // The body is never treated as the payment outcome.
    expect(webhook).not.toMatch(/body\.ResponseCode\s*===\s*0/);
  });

  it("checks a payment against our own order before granting it", () => {
    const billing = read("supabase/functions/_shared/billing.ts");
    expect(billing).toContain("result.ReturnValue !== order.id");
    expect(billing).toContain("order_mismatch");
    expect(billing).toContain("terminal_mismatch");
    expect(billing).toContain("amount_mismatch");
    // A hosted-page result and a token charge both go through Cardcom, never
    // through a value the browser supplied.
    expect(billing).toContain("getLpResult(order.low_profile_id)");
  });

  it("takes the price from the plans table, never from the request", () => {
    const checkout = read("supabase/functions/billing-create-checkout/index.ts");
    expect(checkout).toContain("loadPlan(admin");
    expect(checkout).toContain("amount: plan.amount");
    expect(checkout).not.toMatch(/body\.amount/);
    // Automatic renewal needs recorded consent before any card page opens.
    expect(checkout).toContain('body.accept_renewal !== true');
  });

  it("charges a renewal with an idempotency key and reconciles unknown outcomes", () => {
    const renew = read("supabase/functions/billing-renew/index.ts");
    expect(renew).toContain("externalUniqTranId: externalId");
    expect(renew).toContain("getTransactionByExternalId");
    expect(renew).toContain("billing_charge_unknown");
  });

  it("gives the browser read-only access, and no access at all to card tokens", () => {
    // No write policy on any billing table: only service_role writes.
    expect(migration).not.toMatch(/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i);
    expect(migration).toMatch(/ALTER TABLE public\.payment_methods ENABLE ROW LEVEL SECURITY/);
    expect(migration).not.toMatch(/CREATE POLICY[^;]*ON public\.payment_methods/i);
    expect(migration).not.toMatch(/CREATE POLICY[^;]*ON public\.payment_events/i);
    // The command that grants a paid period is callable by the server only.
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.apply_paid_order(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;",
    );
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.apply_paid_order[^;]*authenticated/);
  });

  it("never reads the token table or Cardcom from the browser", () => {
    for (const file of [
      "src/lib/billing.ts",
      "src/hooks/useSubscription.ts",
      "src/pages/Subscription.tsx",
      "src/pages/Pricing.tsx",
      "src/pages/BillingReturn.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toContain('from("payment_methods")');
      expect(source, file).not.toContain("secure.cardcom.solutions");
    }
  });

  it("declares every billing notification the functions can send", () => {
    const billing = read("supabase/functions/_shared/billing.ts");
    const union = billing.match(/export type BillingEvent =([\s\S]*?);/)?.[1] ?? "";
    const events = [...union.matchAll(/"(billing_[a-z_]+)"/g)].map((match) => match[1]);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(eventsMigration, `${event} missing from enum migration`).toContain(`'${event}'`);
      expect(read("supabase/functions/_shared/notificationCopy.ts"), `${event} edge copy`).toContain(`${event}: {`);
      expect(read("src/lib/notificationCopy.ts"), `${event} client copy`).toContain(`${event}: {`);
    }
  });
});
