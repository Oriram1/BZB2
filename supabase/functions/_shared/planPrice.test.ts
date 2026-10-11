import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { canonicalPlan, signPlan, verifyPlan } from "./planPrice.ts";

const KEY = "unit-test-signing-key-0123456789abcdef-long-enough";
const plan = { id: "quarterly", amount: 30, period_months: 3 };

function withKey<T>(value: string | undefined, run: () => Promise<T>) {
  const previous = Deno.env.get("BILLING_PRICE_SIGNING_KEY");
  if (value === undefined) Deno.env.delete("BILLING_PRICE_SIGNING_KEY");
  else Deno.env.set("BILLING_PRICE_SIGNING_KEY", value);
  return run().finally(() => {
    if (previous === undefined) Deno.env.delete("BILLING_PRICE_SIGNING_KEY");
    else Deno.env.set("BILLING_PRICE_SIGNING_KEY", previous);
  });
}

Deno.test("the canonical form does not depend on how the amount is typed", () => {
  assertEquals(canonicalPlan({ ...plan, amount: 30 }), canonicalPlan({ ...plan, amount: "30.00" }));
  assertEquals(canonicalPlan({ ...plan, amount: 29.9 }), canonicalPlan({ ...plan, amount: "29.90" }));
});

Deno.test("a signed plan verifies, and changing the amount, id or period breaks it", async () => {
  await withKey(KEY, async () => {
    const signature = await signPlan(plan);
    assertEquals(signature.length, 64);
    assertEquals(await verifyPlan({ ...plan, price_signature: signature }), true);
    assertEquals(await verifyPlan({ ...plan, amount: 1, price_signature: signature }), false);
    assertEquals(await verifyPlan({ ...plan, id: "annual", price_signature: signature }), false);
    assertEquals(await verifyPlan({ ...plan, period_months: 12, price_signature: signature }), false);
  });
});

Deno.test("a missing or foreign signature is never valid", async () => {
  await withKey(KEY, async () => {
    assertEquals(await verifyPlan({ ...plan, price_signature: null }), false);
    assertEquals(await verifyPlan({ ...plan, price_signature: "" }), false);
    assertEquals(await verifyPlan({ ...plan, price_signature: "0".repeat(64) }), false);
  });
});

Deno.test("a signature made with another key does not verify", async () => {
  const other = await withKey("another-signing-key-0123456789abcdef-long-enough", () => signPlan(plan));
  await withKey(KEY, async () => {
    assertEquals(await verifyPlan({ ...plan, price_signature: other }), false);
  });
});

Deno.test("with no signing key configured nothing signs or verifies (fail closed)", async () => {
  await withKey(undefined, async () => {
    await assertRejects(() => signPlan(plan), Error, "price_signing_not_configured");
    await assertRejects(() => verifyPlan({ ...plan, price_signature: "a".repeat(64) }), Error, "price_signing_not_configured");
  });
  await withKey("too-short", async () => {
    await assertRejects(() => signPlan(plan), Error, "price_signing_not_configured");
  });
});
