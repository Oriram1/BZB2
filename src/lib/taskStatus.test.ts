import { describe, expect, it } from "vitest";
import { isTaskClosed, isTaskDone, taskStatusLabel, taskVisibilityLabel } from "./taskStatus";

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
  it("reports visibility instead of calling a hidden task open", () => {
    expect(taskVisibilityLabel("open", "hidden", "clean")).toBe("מוסתרת");
    expect(taskVisibilityLabel("open", "pending_review", "clean")).toBe("ממתינה לאישור");
    expect(taskVisibilityLabel("open", "live", "pending_ai")).toBe("בבדיקת בטיחות");
    expect(taskVisibilityLabel("open", "live", "flagged")).toBe("בבדיקת הצוות");
    expect(taskVisibilityLabel("open", "live", "blocked")).toBe("נחסמה");
    expect(taskVisibilityLabel("open", "live", "clean")).toBe("פתוחה להצעות");
    expect(taskVisibilityLabel("open", "live", "clean", true)).toBe("הפרסום מושהה");
    expect(taskVisibilityLabel("open", "live", "clean", null)).toBe("מצב הפרסום לא זמין");
  });

  it("keeps completed and cancelled tasks visibly closed even if publication is hidden", () => {
    expect(taskVisibilityLabel("completed", "hidden", "clean")).toBe("הושלמה");
    expect(taskVisibilityLabel("cancelled", "hidden", "clean")).toBe("בוטלה");
    expect(taskVisibilityLabel("completed", "live", "clean", true)).toBe("הושלמה");
  });

});
