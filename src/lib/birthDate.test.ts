import { describe, expect, it } from "vitest";
import { ageOnDate } from "./birthDate";

describe("ageOnDate", () => {
  it("counts age at the birthday rather than by year alone", () => {
    expect(ageOnDate("2008-11-20", "2026-11-19")).toBe(17);
    expect(ageOnDate("2008-11-20", "2026-11-20")).toBe(18);
  });
  it("rejects impossible, malformed and future dates", () => {
    expect(ageOnDate("2008-02-30", "2026-11-20")).toBeNull();
    expect(ageOnDate("2008-2-3", "2026-11-20")).toBeNull();
    expect(ageOnDate("2027-01-01", "2026-11-20")).toBeNull();
  });
});
