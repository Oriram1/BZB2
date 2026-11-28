import { expect, it, vi } from "vitest";
import { loadPausedTaskIds } from "./taskPause";

const state = vi.hoisted(() => ({ response: { data: null as string[] | null, error: null as { code: string; message: string } | null } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: () => Promise.resolve(state.response) } }));

it("returns visible paused ids when the service supports pausing", async () => {
  state.response = { data: ["task-1"], error: null };
  expect(await loadPausedTaskIds(["task-1", "task-2"])).toEqual({ supported: true, ids: ["task-1"] });
});
it("recognizes the pre-upgrade service but does not hide other errors", async () => {
  state.response = { data: null, error: { code: "PGRST202", message: "function not found" } };
  expect(await loadPausedTaskIds(["task-1"])).toEqual({ supported: false, ids: [] });
  state.response = { data: null, error: { code: "500", message: "database failure" } };
  await expect(loadPausedTaskIds(["task-1"])).rejects.toMatchObject({ code: "500" });
});
