import { describe, expect, it } from "vitest";
import { isTaskClosed, isTaskDone, taskStatusLabel } from "./taskStatus";

describe("task status helpers", () => {
  it("treats completed and cancelled as done, nothing else", () => {
    expect(["open", "accepted", "in_progress", "completed", "cancelled"].map(isTaskDone))
      .toEqual([false, false, false, true, true]);
  });

  it("closes a task for chat and applications once it is done or archived", () => {
    expect(isTaskClosed({ status: "open", archived_at: null })).toBe(false);
    expect(isTaskClosed({ status: "in_progress", archived_at: null })).toBe(false);
    expect(isTaskClosed({ status: "completed", archived_at: null })).toBe(true);
    expect(isTaskClosed({ status: "cancelled", archived_at: null })).toBe(true);
    expect(isTaskClosed({ status: "open", archived_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("falls back to the raw value for a status it does not know", () => {
    expect(taskStatusLabel("completed")).toBe("הושלמה");
    expect(taskStatusLabel("something_new")).toBe("something_new");
  });
});
