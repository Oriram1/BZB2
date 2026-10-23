import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, refreshSession } = vi.hoisted(() => ({ invoke: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke }, auth: { refreshSession } },
}));
import { billingErrorText, payTaskOnce } from "./taskBilling";

const rejected = (status: number, code: string) => ({
  data: null,
  error: { context: new Response(JSON.stringify({ error: code }), { status }) },
});

describe("task payment session recovery", () => {
  beforeEach(() => { invoke.mockReset(); refreshSession.mockReset(); });

  it("refreshes a rejected session and retries checkout once with the new token", async () => {
    invoke.mockResolvedValueOnce(rejected(401, "unauthorized"))
      .mockResolvedValueOnce({ data: { url: "https://checkout.example.test" }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh-test-token" } }, error: null });
    expect(await payTaskOnce("task-id")).toEqual({ ok: true, url: "https://checkout.example.test" });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1][1]).toEqual({ body: { action: "wallet", task_id: "task-id" }, headers: { Authorization: "Bearer fresh-test-token" } });
  });

  it("requires sign-in when the server has revoked the session", async () => {
    invoke.mockResolvedValue(rejected(401, "unauthorized"));
    refreshSession.mockResolvedValue({ data: { session: null }, error: { code: "session_not_found" } });
    expect(await payTaskOnce("task-id")).toEqual({ ok: false, code: "session_expired" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(billingErrorText("session_expired")).toContain("יש להיכנס שוב");
  });

  it("does not loop if the refreshed token is rejected too", async () => {
    invoke.mockImplementation(() => Promise.resolve(rejected(401, "unauthorized")));
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh-test-token" } }, error: null });
    expect(await payTaskOnce("task-id")).toEqual({ ok: false, code: "session_expired" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("never retries a provider or server failure with an uncertain payment outcome", async () => {
    invoke.mockResolvedValue(rejected(502, "payment_unavailable"));
    expect(await payTaskOnce("task-id")).toEqual({ ok: false, code: "payment_unavailable" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
