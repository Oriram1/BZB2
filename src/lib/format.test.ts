import { describe, expect, it } from "vitest";
import { phoneIssue } from "./format";

describe("phoneIssue (live phone validation)", () => {
  it("says nothing for an empty field or a valid number", () => {
    for (const ok of ["", "   ", "0505050505", "050-505-0505", "+972505050505", "972505050505", "505050505", "031234567"]) {
      expect(phoneIssue(ok), ok).toBeNull();
    }
  });

  it("treats a number that is still being typed as incomplete, not wrong", () => {
    for (const partial of ["0", "05", "050", "0505", "050505050", "5", "50", "50505050", "+", "+9", "+97", "972", "+9725", "03", "0312345"]) {
      expect(phoneIssue(partial), partial).toBe("incomplete");
    }
  });

  it("flags a number that no continuation can fix, right away", () => {
    // Twelve digits, as in the screenshot that prompted this.
    expect(phoneIssue("050505050505")).toBe("invalid");
    expect(phoneIssue("05050505050")).toBe("invalid");
    for (const bad of ["1", "12", "0155555555", "0705050505x", "abc", "050-abc", "5050505050", "+1415", "0000000000", "03123456789"]) {
      expect(phoneIssue(bad), bad).toBe("invalid");
    }
  });
});
