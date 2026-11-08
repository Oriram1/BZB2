import { afterEach, expect, it, vi } from "vitest";
import { readStorage, removeStorage, writeStorage } from "./storage";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it("keeps local and session values apart", () => {
  expect(writeStorage("k", "local")).toBe(true);
  expect(writeStorage("k", "session", "session")).toBe(true);
  expect(readStorage("k")).toBe("local");
  expect(readStorage("k", "session")).toBe("session");
  removeStorage("k");
  expect(readStorage("k")).toBeNull();
  expect(readStorage("k", "session")).toBe("session");
});

it("behaves as an empty store when the browser refuses storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readStorage("k")).toBeNull();
  expect(writeStorage("k", "v")).toBe(false);
  expect(() => removeStorage("k")).not.toThrow();
});
