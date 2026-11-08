import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { plansRead } = vi.hoisted(() => ({ plansRead: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: plansRead }) }) },
}));
import { invalidatePlans, mergePaymentHistory, usePlans } from "./billing";
import { queryClient } from "./queryClient";

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

describe("usePlans", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: queryClient }, children);
  afterEach(() => queryClient.clear());

  it("lists the paid plans with numeric prices and reloads after an admin price change", async () => {
    plansRead.mockResolvedValueOnce({ data: [
      { id: "quarterly", name: "רבעוני", amount: "30.00", period_months: 3, active: true },
      { id: "free", name: "חינם", amount: 0, period_months: 0, active: true },
    ], error: null });
    const { result } = renderHook(usePlans, { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plans).toEqual({ quarterly: { name: "רבעוני", price: 30, periodMonths: 3 } });

    plansRead.mockResolvedValueOnce({ data: [{ id: "quarterly", name: "רבעוני", amount: 35, period_months: 3, active: true }], error: null });
    await invalidatePlans();
    await waitFor(() => expect(result.current.plans.quarterly?.price).toBe(35));
  });

  it("shows no plans, and stops loading, when they cannot be read", async () => {
    plansRead.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    const { result } = renderHook(usePlans, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plans).toEqual({});
  });
});
