import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20260930160226_billing.sql");
const eventsMigration = read("supabase/migrations/20260930160155_billing_notification_events.sql");

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

  it("refuses to start or renew a charge unless billing is switched on", () => {
    expect(read("supabase/functions/billing-create-checkout/index.ts")).toContain("billing_disabled");
    expect(read("supabase/functions/billing-renew/index.ts")).toContain("billingEnabled()");
    expect(read("supabase/functions/_shared/cardcom.ts")).toContain('=== "true"');
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

  it("charges only a price that carries a valid signature", () => {
    const billing = read("supabase/functions/_shared/billing.ts");
    // loadPlan verifies by default; the callers that charge must not opt out.
    expect(billing).toContain("verifyPlan(data)");
    expect(billing).toContain("PlanIntegrityError");
    expect(read("supabase/functions/billing-create-checkout/index.ts")).toContain("price_integrity_error");
    const renew = read("supabase/functions/billing-renew/index.ts");
    const chargeRenewal = renew.slice(renew.indexOf("async function chargeRenewal"));
    expect(chargeRenewal.slice(0, 600)).not.toContain("verify: false");
    expect(read("supabase/functions/billing-create-checkout/index.ts")).not.toContain("verify: false");
  });

  it("changes prices only through the admin function, and keeps the signing key out of the database", () => {
    const fn = read("supabase/functions/admin-set-plan-price/index.ts");
    expect(fn).toContain('.eq("role", "admin")');
    expect(fn).toContain("signPlan(");
    expect(fn).toContain('admin.rpc("admin_set_plan_price"');
    expect(read("supabase/config.toml")).toContain("[functions.admin-set-plan-price]\nverify_jwt = true");

    const migration = read("supabase/migrations/20261011170000_plan_price_integrity.sql");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_plans FROM anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_set_plan_price(TEXT, NUMERIC, TEXT, UUID) TO service_role");
    // The key is an Edge Function secret, not something a migration or a table stores.
    expect(migration).not.toContain("BILLING_PRICE_SIGNING_KEY");
    expect(read("supabase/functions/_shared/planPrice.ts")).toContain('Deno.env.get("BILLING_PRICE_SIGNING_KEY")');
  });

  it("does not hardcode a plan price in the screens", () => {
    for (const file of ["src/pages/Pricing.tsx", "src/pages/Register.tsx", "src/pages/Subscription.tsx", "src/components/billing/CheckoutConsentDialog.tsx"]) {
      expect(read(file), file).not.toMatch(/\b(30|100) ₪/);
    }
    expect(read("src/lib/billing.ts")).not.toContain("PAID_PLANS");
  });

  it("can open every admin tab, including pricing, from the URL", () => {
    const admin = read("src/pages/Admin.tsx");
    const values = admin.match(/const TAB_VALUES = \[([^\]]+)\]/)?.[1] ?? "";
    // Each trigger in the tab bar must be a value the URL is allowed to select,
    // otherwise the tab highlights but the content falls back to the overview.
    const triggers = [...admin.matchAll(/\{ value: "([a-z]+)", label:/g)].map((match) => match[1]);
    expect(triggers).toContain("pricing");
    for (const value of triggers) expect(values, value).toContain(`"${value}"`);
    for (const value of triggers) expect(admin, value).toContain(`<TabsContent value="${value}"`);
  });
});
