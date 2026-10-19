import { describe, expect, it } from "vitest";
import { ageIssue, MAX_AGE, phoneIssue } from "./format";

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

describe("ageIssue (live age validation)", () => {
  it("accepts ages from the minimum up to the maximum", () => {
    for (const age of ["18", "25", "99", String(MAX_AGE)]) expect(ageIssue(age, 18), age).toBeNull();
    expect(ageIssue("13", 13)).toBeNull();
  });

  it("flags an age that is too high as soon as it is typed", () => {
    expect(ageIssue("121", 18)).toBe("above");
    expect(ageIssue("345", 18)).toBe("above");
    expect(ageIssue("999", 13)).toBe("above");
  });

  it("reports an age under the minimum for the caller to time", () => {
    expect(ageIssue("1", 18)).toBe("below");
    expect(ageIssue("17", 18)).toBe("below");
    expect(ageIssue("12", 13)).toBe("below");
  });

  it("says nothing about an empty field", () => {
    expect(ageIssue("", 18)).toBeNull();
  });
});
