import { describe, expect, it } from "vitest";
import { completedPerformingTasks } from "./completedTasks";

describe("completedPerformingTasks", () => {
  it("shows only completed tasks the performer was accepted for", () => {
    const tasks = [
      { id: "done", status: "completed", applicationStatus: "accepted" },
      { id: "pending", status: "completed", applicationStatus: "pending" },
      { id: "cancelled", status: "cancelled", applicationStatus: "accepted" },
      { id: "open", status: "open", applicationStatus: "accepted" },
    ];
    expect(completedPerformingTasks(tasks).map((task) => task.id)).toEqual(["done"]);
  });
});
