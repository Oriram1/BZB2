import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSubscription } from "./useSubscription";

const mock = vi.hoisted(() => ({ user: { id: "first" } as { id: string } | null, read: vi.fn(), eq: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({
  eq: (...args: unknown[]) => { mock.eq(...args); return { maybeSingle: mock.read }; },
}) }) } }));
beforeEach(() => { mock.user = { id: "first" }; vi.clearAllMocks(); });
afterEach(cleanup);

it("recovers an existing account's subscription and refreshes without a purchase", async () => {
  mock.read.mockResolvedValueOnce({ data: null, error: null });
  const { result } = renderHook(useSubscription);
  await waitFor(() => expect(result.current.loading).toBe(false));
  mock.read.mockResolvedValueOnce({ data: { status: "active" }, error: null });
  await act(async () => { await result.current.reload(); });
  expect(result.current.subscription).toMatchObject({ status: "active" });
  expect(mock.eq).toHaveBeenLastCalledWith("user_id", "first");
});

it("reports transport failures and allows recovery", async () => {
  mock.read.mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(useSubscription);
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.loading).toBe(false);
  mock.read.mockResolvedValueOnce({ data: null, error: null });
  await act(async () => { await result.current.reload(); });
  expect(result.current.failed).toBe(false);
});

it("does not restore the previous account's subscription after switching accounts", async () => {
  let finish!: (value: unknown) => void;
  mock.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(useSubscription);
  mock.user = { id: "second" };
  mock.read.mockResolvedValueOnce({ data: null, error: null });
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { finish({ data: { status: "active" }, error: null }); });
  expect(result.current.subscription).toBeNull();
  mock.user = null;
  rerender();
  expect(result.current.subscription).toBeNull();
  expect(result.current.failed).toBe(false);
});

it("ignores an older response arriving after a newer refresh", async () => {
  let finish!: (value: unknown) => void;
  mock.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(useSubscription);
  mock.read.mockResolvedValueOnce({ data: { status: "active" }, error: null });
  await act(async () => { await result.current.reload(); });
  await act(async () => { finish({ data: null, error: null }); });
  expect(result.current.subscription).toMatchObject({ status: "active" });
});
