import { expect, it } from "vitest";
import { taskTagLabels } from "./taskTags";

it("returns labels in the designed order and skips unknown values", () => {
  expect(taskTagLabels(["flexible_hours", "bogus", "physical"]).map((t) => t.label)).toEqual(["עבודה פיזית", "שעות גמישות"]);
});
it("handles missing tags", () => {
  expect(taskTagLabels(null)).toEqual([]);
  expect(taskTagLabels(undefined)).toEqual([]);
});
