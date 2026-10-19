import { describe, expect, it } from "vitest";
import { mergePaymentHistory } from "./billing";

const order = (over = {}) => ({ id: "o1", amount: 0.1, status: "paid" as const, kind: "renewal", paid_at: "2026-10-19T12:50:00Z", created_at: "2026-10-19T12:50:00Z", document_url: null, ...over });
const charge = (over = {}) => ({ id: "c1", amount: 0.4, status: "paid" as const, purpose: "plan_change", paid_at: "2026-10-19T16:11:00Z", created_at: "2026-10-19T16:11:00Z", document_url: null, ...over });

describe("mergePaymentHistory", () => {
  it("shows an upgrade charge next to the subscription payments, newest first", () => {
    const rows = mergePaymentHistory([order()], [charge()]);
    expect(rows.map((r) => r.label)).toEqual(["מעבר מסלול", "חידוש מנוי"]);
    expect(rows[0].amount).toBe(0.4);
  });

  it("labels task fees and keeps refunded entries visible", () => {
    const rows = mergePaymentHistory([], [charge({ purpose: "task", status: "refunded", amount: 0.2 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "עמלת פרסום מטלה", status: "refunded", amount: 0.2 });
  });

  it("ignores charges that are not money the customer paid (card saves)", () => {
    expect(mergePaymentHistory([], [charge({ purpose: "card_setup", amount: 0 })])).toEqual([]);
  });

  it("uses the payment date, falls back to creation, and respects the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => order({ id: `o${i}`, paid_at: null, created_at: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));
    const rows = mergePaymentHistory(many, [], 24);
    expect(rows).toHaveLength(24);
    expect(rows[0].date > rows[23].date).toBe(true);
  });

  it("passes the receipt link through", () => {
    const rows = mergePaymentHistory([order({ document_url: "https://example.test/doc" })], []);
    expect(rows[0].document_url).toBe("https://example.test/doc");
  });
});
