import { describe, expect, it } from "vitest";
import { visibleNavItems } from "./navItems";

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
