import { expect, it } from "vitest";
import { resolveActiveRole } from "./activeRole";
it("uses the saved mode only when the account owns that role", () => {
  expect(resolveActiveRole(["tasker", "bee"], "bee")).toBe("bee");
  expect(resolveActiveRole(["tasker"], "bee")).toBe("tasker");
  expect(resolveActiveRole(["admin", "bee"], null)).toBe("bee");
  expect(resolveActiveRole(["admin"], null)).toBeNull();
});
