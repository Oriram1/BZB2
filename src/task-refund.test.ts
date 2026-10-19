import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { processTaskRefunds } from "../supabase/functions/_shared/taskRefund";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

type Charge = { id: string; amount: number; deal_number: number };
type Request = { id: string; user_id: string; task_id: string; task_name: string; amount: number; charges: Charge[] };

/** A stand-in for the queue: claim works once per request, like the SQL does. */
function fakeAdmin(requests: Request[]) {
  const state = new Map(requests.map((r) => [r.id, { ...r, status: "requested" as string }]));
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [...state.values()].filter((r) => r.status === "requested").map((r) => ({ id: r.id })),
              error: null,
            }),
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "task_refund_claim") {
        const r = state.get(args._refund_id as string);
        if (!r || r.status !== "requested") return { data: null, error: null };
        r.status = "started";
        return { data: r, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { admin: admin as never, calls, state };
}

const request = (over: Partial<Request> = {}): Request => ({
  id: "r1",
  user_id: "u1",
  task_id: "t1",
  task_name: "ניקיון",
  amount: 3,
  charges: [{ id: "c1", amount: 3, deal_number: 777 }],
  ...over,
});

describe("task fee refunds", () => {
  it("refunds the confirmed charge once, marks it, and tells the owner", async () => {
    const { admin, calls } = fakeAdmin([request()]);
    const refunded: number[] = [];
    const notified: unknown[] = [];
    const summary = await processTaskRefunds(admin, {
      refund: async ({ transactionId }) => (refunded.push(transactionId), { ok: true }),
      notify: async (userId, data) => void notified.push({ userId, data }),
    });
    expect(summary).toEqual({ refunded: 1, failed: 0, skipped: 0 });
    expect(refunded).toEqual([777]);
    expect(calls.map((c) => c.fn)).toEqual(["task_refund_claim", "task_refund_charge_done", "task_refund_finish"]);
    expect(calls[2].args).toMatchObject({ _ok: true });
    expect(notified).toEqual([{ userId: "u1", data: { task_id: "t1", task_name: "ניקיון", amount: 3 } }]);
  });

  it("never refunds the same request twice, even when two runs overlap", async () => {
    const { admin } = fakeAdmin([request()]);
    let refunds = 0;
    const deps = { refund: async () => (refunds++, { ok: true }), notify: async () => {} };
    await Promise.all([processTaskRefunds(admin, deps), processTaskRefunds(admin, deps)]);
    expect(refunds).toBe(1);
  });

  it("records a Cardcom refusal and sends no notification", async () => {
    const { admin, calls } = fakeAdmin([request()]);
    let notified = 0;
    const summary = await processTaskRefunds(admin, {
      refund: async () => ({ ok: false, code: 603, description: "no funds" }),
      notify: async () => void notified++,
    });
    expect(summary.failed).toBe(1);
    expect(notified).toBe(0);
    expect(calls.find((c) => c.fn === "task_refund_charge_done")).toBeUndefined();
    expect(calls.find((c) => c.fn === "task_refund_finish")?.args).toMatchObject({ _ok: false, _code: 603, _error: "no funds" });
  });

  it("stops at the first refused charge and does not refund the rest", async () => {
    const two = request({ charges: [{ id: "c1", amount: 2, deal_number: 1 }, { id: "c2", amount: 1, deal_number: 2 }] });
    const { admin } = fakeAdmin([two]);
    const asked: number[] = [];
    await processTaskRefunds(admin, {
      refund: async ({ transactionId }) => (asked.push(transactionId), { ok: false, code: 1 }),
      notify: async () => {},
    });
    expect(asked).toEqual([1]);
  });

  it("still refunds when the account was deleted, and tells no one", async () => {
    const { admin } = fakeAdmin([request({ user_id: null as unknown as string })]);
    let refunded = 0;
    let notified = 0;
    const summary = await processTaskRefunds(admin, {
      refund: async () => (refunded++, { ok: true }),
      notify: async () => void notified++,
    });
    expect(summary.refunded).toBe(1);
    expect(refunded).toBe(1);
    expect(notified).toBe(0);
  });

  it("fails a request that has nothing refundable instead of pretending", async () => {
    const { admin, calls } = fakeAdmin([request({ charges: [] })]);
    const summary = await processTaskRefunds(admin, { refund: async () => ({ ok: true }), notify: async () => {} });
    expect(summary.failed).toBe(1);
    expect(calls.find((c) => c.fn === "task_refund_finish")?.args).toMatchObject({ _ok: false, _error: "no_refundable_charge" });
  });
});

describe("refund wiring", () => {
  const migration = read("supabase/migrations/20261019120100_first_approved_task_free_and_refunds.sql");

  it("lets only the server touch the refund queue", () => {
    expect(migration).toContain("REVOKE ALL ON public.task_refunds FROM PUBLIC, anon, authenticated");
    for (const fn of ["task_refund_claim", "task_refund_charge_done", "task_refund_finish"]) {
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`));
    }
  });

  it("allows one refund per task and queues only confirmed, unrefunded charges", () => {
    expect(migration).toMatch(/task_id UUID NOT NULL UNIQUE/);
    expect(migration).toContain("deal_number IS NOT NULL");
    expect(migration).toContain("refunded_at IS NULL");
  });

  it("answers to a shared secret or an admin, nobody else", () => {
    const fn = read("supabase/functions/task-refund/index.ts");
    expect(fn).toContain('requireSecret(req, "NOTIFY_DISPATCH_SECRET")');
    expect(fn).toContain('hasRole(clients.admin, clients.user.id, "admin")');
    expect(fn).toContain("billingEnabled()");
    expect(read("supabase/config.toml")).toContain("[functions.task-refund]\nverify_jwt = false");
  });

  it("keeps the new fee column out of a client's reach", () => {
    expect(migration).toContain("NEW.fee_amount IS DISTINCT FROM OLD.fee_amount");
  });

  it("declares the refunded event everywhere it is used", () => {
    expect(read("supabase/migrations/20261019120000_task_refunded_event.sql")).toContain("'task_refunded'");
    const copy = read("supabase/functions/_shared/notificationCopy.ts");
    expect(copy.match(/task_refunded/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("decides the free slot when an admin approves, under a per-user lock", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("free_available");
    expect(migration).toContain("takes_free");
  });
});

describe("charge confirmation before publishing", () => {
  const page = read("src/pages/CreateTask.tsx");

  it("asks first when a paid task will be charged to a saved card", () => {
    expect(page).toContain('data-testid="charge-confirm"');
    expect(page).toMatch(/latest\.due > 0 && latest\.has_card/);
    expect(page).toContain("setConfirmQuote(latest)");
  });

  it("states the amount and the card, and that a rejected task costs nothing", () => {
    expect(page).toContain("card_last4");
    expect(page).toContain("אם המטלה לא תאושר, לא תחויבו בכלום");
  });

  it("gets the card digits only from the signed-in user's own row, never the token", () => {
    // Comments aside, the statement never selects the token column.
    const sql = read("supabase/migrations/20261019130000_quote_card_last4.sql").replace(/--.*$/gm, "");
    expect(sql).toContain("WHERE user_id = auth.uid()");
    expect(sql).not.toMatch(/\btoken\b/);
  });
});

describe("payment records after an account is deleted", () => {
  const sql = read("supabase/migrations/20261019140000_keep_payment_records_after_account_deletion.sql");
  const code = sql.replace(/--.*$/gm, "");

  it("keeps charges, orders, refund attempts and refunds, cutting only the link to the person", () => {
    for (const table of ["billing_charges", "payment_orders", "billing_refund_attempts", "task_refunds"]) {
      expect(code, table).toContain(`'${table}'`);
    }
    expect(code).toContain("ALTER COLUMN user_id DROP NOT NULL");
    expect(code).toContain("ON DELETE SET NULL");
    expect(code).not.toMatch(/ON DELETE CASCADE/);
  });

  it("strips what identifies the person before the account goes", () => {
    expect(code).toContain("BEFORE DELETE ON auth.users");
    expect(code).toContain("document_url = NULL, meta = NULL");
    expect(code).toContain("task_name = NULL");
  });

  it("never keeps the saved card: the token table still cascades", () => {
    const original = read("supabase/migrations/20260930160226_billing.sql");
    const table = original.slice(original.indexOf("CREATE TABLE public.payment_methods"));
    expect(table.slice(0, table.indexOf(");"))).toContain("ON DELETE CASCADE");
    expect(code).not.toContain("payment_methods");
  });

  it("lets only admins read records that have no owner", () => {
    expect(code).toContain('"Admins read payment records"');
    expect(code).toContain("private.has_role(auth.uid(), 'admin'::public.app_role)");
  });
});
