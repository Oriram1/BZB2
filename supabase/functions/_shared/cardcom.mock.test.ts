import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { cardcomConfig, cardcomMode, chargeToken, getDocumentUrl, createLowProfile, getLpResult, getTransactionByExternalId, refundTransaction } from "./cardcom.ts";
import {
  MOCK_API_NAME,
  MOCK_API_PASSWORD,
  MOCK_TERMINAL,
  startMockCardcom,
} from "./cardcom_mock.ts";
import { applyVerdict, evaluateTransaction, settleLowProfileOrder, type OrderRow } from "./billing.ts";

import { settleChargePage } from "./taskBilling.ts";

const ORDER_ID = "22222222-2222-2222-2222-222222222222";

function useMock(apiName = MOCK_API_NAME) {
  const mock = startMockCardcom();
  Deno.env.set("CARDCOM_BASE_URL", mock.url);
  Deno.env.delete("CARDCOM_MODE");
  Deno.env.set("CARDCOM_TEST_TERMINAL", String(MOCK_TERMINAL));
  Deno.env.set("CARDCOM_TEST_API_NAME", apiName);
  Deno.env.set("CARDCOM_TEST_API_PASSWORD", MOCK_API_PASSWORD);
  return mock;
}

/** Records what billing wrote; just enough of the Supabase client surface. */
function fakeAdmin(rpcResult: unknown = { applied: true, plan_name: "רבעוני", amount: 30, period_end: "2027-01-01" }) {
  const calls: { kind: string; name: string; args?: unknown }[] = [];
  const chain = (table: string) => {
    const builder: Record<string, unknown> = {
      insert: (row: unknown) => {
        calls.push({ kind: "insert", name: table, args: row });
        return Promise.resolve({ error: null });
      },
      update: (row: unknown) => {
        calls.push({ kind: "update", name: table, args: row });
        return builder;
      },
      eq: () => builder,
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return builder;
  };
  const admin = {
    from: chain,
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve({ data: rpcResult, error: null });
    },
  } as unknown as SupabaseClient;
  return { admin, calls };
}

const pendingOrder = (lowProfileId: string, amount = 30): OrderRow => ({
  id: ORDER_ID,
  user_id: "user-1",
  plan_id: "quarterly",
  kind: "initial",
  amount,
  status: "pending",
  low_profile_id: lowProfileId,
  external_uniq_id: null,
  deal_number: null,
});

async function createPage(amount = 30) {
  return await createLowProfile({
    amount,
    returnValue: ORDER_ID,
    productName: "מנוי רבעוני",
    successUrl: "https://app.test/ok",
    failedUrl: "https://app.test/fail",
    cancelUrl: "https://app.test/cancel",
    webhookUrl: "https://app.test/webhook",
  });
}

Deno.test("the override refuses a non-loopback host, so credentials cannot be redirected", async () => {
  Deno.env.set("CARDCOM_BASE_URL", "https://evil.example.com/api/v11");
  Deno.env.set("CARDCOM_TEST_TERMINAL", "1000");
  Deno.env.set("CARDCOM_TEST_API_NAME", "x");
  Deno.env.set("CARDCOM_TEST_API_PASSWORD", "y");
  try {
    await assertRejects(() => getLpResult("lp-1"), Error, "cardcom_base_url_not_local");
  } finally {
    Deno.env.delete("CARDCOM_BASE_URL");
  }
});

Deno.test("a wrong ApiName is the 401 / 603 the real terminal gave us", async () => {
  const mock = useMock("wrong-name");
  try {
    await assertRejects(() => createPage(), Error, "cardcom_http_401");
  } finally {
    await mock.close();
  }
});

Deno.test("a paid hosted page settles the order, grants the period and notifies once", async () => {
  const mock = useMock();
  try {
    const page = await createPage();
    mock.pages.get(page.lowProfileId)!.outcome = "paid";
    const { admin, calls } = fakeAdmin();

    const result = await settleLowProfileOrder(admin, pendingOrder(page.lowProfileId));
    assertEquals(result.status, "paid");

    const rpc = calls.find((c) => c.kind === "rpc")!;
    assertEquals(rpc.name, "apply_paid_order");
    const args = rpc.args as Record<string, unknown>;
    assertEquals(args._order_id, ORDER_ID);
    assertEquals(args._card_last4, "4580");
    assertEquals(args._card_expiry, "0429");
    assertEquals(typeof args._token, "string");
    assertEquals(calls.filter((c) => c.kind === "insert" && c.name === "notifications").length, 1);
  } finally {
    await mock.close();
  }
});

Deno.test("an unpaid page stays pending and writes nothing", async () => {
  const mock = useMock();
  try {
    const page = await createPage();
    const { admin, calls } = fakeAdmin();
    assertEquals((await settleLowProfileOrder(admin, pendingOrder(page.lowProfileId))).status, "pending");
    assertEquals(calls.length, 0);
  } finally {
    await mock.close();
  }
});

Deno.test("a declined card fails the order and grants nothing", async () => {
  const mock = useMock();
  try {
    const page = await createPage();
    mock.pages.get(page.lowProfileId)!.outcome = "declined";
    const { admin, calls } = fakeAdmin();

    assertEquals((await settleLowProfileOrder(admin, pendingOrder(page.lowProfileId))).status, "failed");
    assertEquals(calls.some((c) => c.kind === "rpc"), false);
    assertEquals(
      (calls.find((c) => c.kind === "update")!.args as Record<string, unknown>).status,
      "failed",
    );
  } finally {
    await mock.close();
  }
});

Deno.test("a cheaper payment than the order is rejected and never grants the plan", async () => {
  const mock = useMock();
  try {
    const page = await createPage(1);
    mock.pages.get(page.lowProfileId)!.outcome = "paid";
    const { admin, calls } = fakeAdmin();

    const result = await settleLowProfileOrder(admin, pendingOrder(page.lowProfileId, 30));
    assertEquals(result.status, "failed");
    assertEquals(calls.some((c) => c.kind === "rpc"), false);
    assertEquals((calls.find((c) => c.kind === "update")!.args as Record<string, unknown>).error, "amount_mismatch");
  } finally {
    await mock.close();
  }
});

Deno.test("an order that is already paid is not settled again", async () => {
  const mock = useMock();
  try {
    const { admin, calls } = fakeAdmin();
    const order = { ...pendingOrder("lp-1"), status: "paid" as const };
    assertEquals((await settleLowProfileOrder(admin, order)).status, "paid");
    assertEquals(calls.length, 0);
    assertEquals(mock.requests.length, 0);
  } finally {
    await mock.close();
  }
});

Deno.test("renewal: a token charge pays, a repeat is a duplicate, a decline fails", async () => {
  const mock = useMock();
  try {
    const first = await chargeToken({ token: "tok-ok", expiryMMYY: "0429", amount: 30, externalUniqTranId: "renew-1" });
    assertEquals(evaluateTransaction(first, { amount: 30 }).kind, "paid");

    const repeat = await chargeToken({ token: "tok-ok", expiryMMYY: "0429", amount: 30, externalUniqTranId: "renew-1" });
    assertEquals(evaluateTransaction(repeat, { amount: 30 }).kind, "duplicate");

    // The lookup by idempotency key finds the first attempt.
    const found = await getTransactionByExternalId("renew-1");
    assertEquals(found.TranzactionId, first.TranzactionId);

    const declined = await chargeToken({ token: "tok-decline", expiryMMYY: "0429", amount: 30, externalUniqTranId: "renew-2" });
    assertEquals(evaluateTransaction(declined, { amount: 30 }).kind, "failed");
  } finally {
    await mock.close();
  }
});

Deno.test("refund needs the API password", async () => {
  const mock = useMock();
  try {
    assertEquals((await refundTransaction({ transactionId: 9000, partialSum: 10 })).ok, true);

    Deno.env.set("CARDCOM_TEST_API_PASSWORD", "wrong");
    await assertRejects(() => refundTransaction({ transactionId: 9000 }), Error, "cardcom_http_401");
  } finally {
    await mock.close();
  }
});

Deno.test("the mode picks which terminal is used, and anything but 'live' is test", () => {
  const set = (k: string, v?: string) => (v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v));
  const saved = ["CARDCOM_MODE", "CARDCOM_TERMINAL", "CARDCOM_API_NAME", "CARDCOM_API_PASSWORD",
    "CARDCOM_TEST_TERMINAL", "CARDCOM_TEST_API_NAME", "CARDCOM_TEST_API_PASSWORD"].map((k) => [k, Deno.env.get(k)] as const);
  try {
    set("CARDCOM_TERMINAL", "197542");
    set("CARDCOM_API_NAME", "live-name");
    set("CARDCOM_API_PASSWORD", "live-pw");
    set("CARDCOM_TEST_TERMINAL", "1000");
    set("CARDCOM_TEST_API_NAME", "test-name");
    set("CARDCOM_TEST_API_PASSWORD", "test-pw");

    set("CARDCOM_MODE");
    assertEquals([cardcomMode(), cardcomConfig().terminal], ["test", 1000]);
    set("CARDCOM_MODE", "Live ");
    assertEquals(cardcomMode(), "test");
    set("CARDCOM_MODE", "live");
    assertEquals([cardcomMode(), cardcomConfig().terminal, cardcomConfig().apiName], ["live", 197542, "live-name"]);

    // Live selected but the test credentials are the only ones set: never fall back.
    set("CARDCOM_TERMINAL");
    set("CARDCOM_API_NAME");
    set("CARDCOM_API_PASSWORD");
    try {
      cardcomConfig();
      throw new Error("should have thrown");
    } catch (error) {
      assertEquals((error as Error).message, "cardcom_not_configured");
    }
  } finally {
    for (const [k, v] of saved) set(k, v);
  }
});

Deno.test("an issued document is linked: the URL is requested when the result has none", async () => {
  const mock = useMock();
  try {
    assertEquals(
      await getDocumentUrl("TaxInvoiceAndReceipt", 662756),
      `${new URL(mock.url).origin}/doc/TaxInvoiceAndReceipt/662756`,
    );

    const { admin, calls } = fakeAdmin();
    await applyVerdict(admin, pendingOrder("lp-x"), {
      dealNumber: 1,
      token: "t",
      last4: "4580",
      expiry: "1230",
      documentNumber: 662756,
      documentType: "TaxInvoiceAndReceipt",
      documentUrl: null,
    });
    const args = calls.find((c) => c.kind === "rpc")!.args as Record<string, unknown>;
    assertEquals(args._document_number, 662756);
    assertEquals(String(args._document_url).endsWith("/doc/TaxInvoiceAndReceipt/662756"), true);
  } finally {
    await mock.close();
  }
});

Deno.test("a document link that cannot be fetched never blocks granting the subscription", async () => {
  const mock = useMock();
  Deno.env.set("CARDCOM_TEST_API_PASSWORD", "wrong");
  try {
    assertEquals(await getDocumentUrl("TaxInvoiceAndReceipt", 1), null);
    const { admin, calls } = fakeAdmin();
    const result = await applyVerdict(admin, pendingOrder("lp-y"), {
      dealNumber: 2,
      token: null,
      last4: null,
      expiry: null,
      documentNumber: 5,
      documentType: "TaxInvoiceAndReceipt",
      documentUrl: null,
    });
    assertEquals(result.applied, true);
    assertEquals((calls.find((c) => c.kind === "rpc")!.args as Record<string, unknown>)._document_url, null);
  } finally {
    await mock.close();
  }
});

Deno.test("one-time wallet payment settles without replacing the saved subscription card", async () => {
  const mock = useMock();
  try {
    const page = await createLowProfile({ amount: 8, operation: "ChargeOnly", returnValue: ORDER_ID,
      productName: "Task", successUrl: "https://app.test/ok", failedUrl: "https://app.test/fail",
      cancelUrl: "https://app.test/cancel", webhookUrl: "https://app.test/webhook" });
    assertEquals(mock.requests.at(-1)?.body.Operation, "ChargeOnly");
    mock.pages.get(page.lowProfileId)!.outcome = "paid";
    // Even an unexpected token in a one-time response must not become recurring.
    const { admin, calls } = fakeAdmin({ applied: false });
    const result = await settleChargePage(admin, { id: ORDER_ID, user_id: "user-1", purpose: "task",
      task_id: "task-1", plan_id: null, amount: 8, status: "pending", low_profile_id: page.lowProfileId,
      external_uniq_id: null, deal_number: null, meta: { payment_mode: "one_time" } });
    assertEquals(result.status, "paid");
    assertEquals(calls.filter(c => c.name === "billing_charge_paid").length, 1);
    assertEquals(calls.filter(c => c.name === "save_payment_method").length, 0);
  } finally {
    await mock.close();
  }
});
