import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeTask } from "./taskActions";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

beforeEach(() => rpc.mockReset());

describe("completeTask", () => {
  it("asks the server to complete the task and reports success as null", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await completeTask("t1")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("complete_task", { _task_id: "t1" });
  });

  it("explains a refusal for a task nobody was picked for", async () => {
    rpc.mockResolvedValue({ error: { message: "no_accepted_worker" } });
    expect(await completeTask("t1")).toContain("נבחר לה עובד");
  });

  it("explains a refusal for a cancelled task", async () => {
    rpc.mockResolvedValue({ error: { message: "task_cancelled" } });
    expect(await completeTask("t1")).toContain("בוטלה");
  });

  it("falls back to a generic message for anything else", async () => {
    rpc.mockResolvedValue({ error: { message: "connection reset" } });
    expect(await completeTask("t1")).toBe("לא הצלחנו לסמן את המטלה כהושלמה");
  });
});
