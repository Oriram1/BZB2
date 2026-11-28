import { describe, expect, it } from "vitest";
import { isDrawerItemActive, selectedTaskDetailsPath, visibleNavItems } from "./navItems";

const paths = (signedIn: boolean, roles: string[]) =>
  visibleNavItems(signedIn, roles).map((item) => item.to);

describe("visibleNavItems", () => {
  it("keeps pricing out of a bee's menu", () => {
    // The page is about the commission a publisher pays; a bee never pays it.
    expect(paths(true, ["bee"])).not.toContain("/pricing");
    expect(paths(true, ["tasker"])).toContain("/pricing");
  });

  it("still shows pricing to a guest", () => {
    // It is the marketing page too, and a guest has no roles to match against.
    expect(paths(false, [])).toContain("/pricing");
  });

  it("hides private screens from a guest even without a role rule", () => {
    const guest = paths(false, []);
    expect(guest).not.toContain("/my-tasks");
    expect(guest).not.toContain("/chat");
    expect(guest).not.toContain("/settings");
  });

  it("hides the guest-only entries once signed in", () => {
    expect(paths(true, ["bee"])).not.toContain("/auth");
    expect(paths(false, [])).toContain("/auth");
  });

  it("does not leak admin or parent screens to an ordinary account", () => {
    const bee = paths(true, ["bee"]);
    expect(bee).not.toContain("/admin");
    expect(bee).not.toContain("/parent");
    expect(paths(true, ["admin"])).toContain("/admin");
  });
});

describe("selectedTaskDetailsPath", () => {
  it("links to the task selected in the publisher's tasks screen", () => {
    expect(selectedTaskDetailsPath("/my-tasks", "?tab=applications&task=abc-123")).toBe("/task/abc-123");
  });

  it("does not invent a task when no task is selected", () => {
    expect(selectedTaskDetailsPath("/my-tasks", "?tab=published")).toBeNull();
    expect(selectedTaskDetailsPath("/profile", "?task=abc-123")).toBeNull();
  });
});

describe("isDrawerItemActive", () => {
  it("marks the publisher's tasks entry for its published and applications tabs", () => {
    expect(isDrawerItemActive("/my-tasks", "/my-tasks", "?tab=published", false)).toBe(true);
    expect(isDrawerItemActive("/my-tasks", "/my-tasks", "?tab=applications&task=abc", false)).toBe(true);
  });

  it("keeps saved and performing views distinct from their parent entries", () => {
    expect(isDrawerItemActive("/tasks", "/tasks", "?saved=1", true)).toBe(false);
    expect(isDrawerItemActive("/tasks?saved=1", "/tasks", "?sort=price&saved=1", true)).toBe(true);
    expect(isDrawerItemActive("/my-tasks", "/my-tasks", "?tab=performing", true)).toBe(true);
    expect(isDrawerItemActive("/my-tasks", "/my-tasks", "?tab=performing&completed=1", true)).toBe(false);
    expect(isDrawerItemActive("/my-tasks?tab=performing&completed=1", "/my-tasks", "?completed=1&task=abc&tab=performing", true)).toBe(true);
  });
});
