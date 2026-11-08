import { afterEach, expect, it } from "vitest";
import { allowPerformanceUrl, getStoredConsent } from "./performanceConsent";

afterEach(() => localStorage.clear());
it("requires a stored explicit all-consent choice", () => {
  expect(getStoredConsent()).toBeNull();
  localStorage.setItem("bzb_cookie_consent", "essential");
  expect(getStoredConsent()).toBe("essential");
  localStorage.setItem("bzb_cookie_consent", "all");
  expect(getStoredConsent()).toBe("all");
});
it("allows only fixed public paths without parameters, fragments or another origin", () => {
  const origin = "https://example.test";
  expect(allowPerformanceUrl("/", origin)).toBe(true);
  expect(allowPerformanceUrl("/tasks", origin)).toBe(true);
  for (const path of ["/parent/view/secret", "/task/123", "/auth/callback", "/tasks?token=secret", "/#token", "https://other.test/tasks"]) {
    expect(allowPerformanceUrl(path, origin)).toBe(false);
  }
});
