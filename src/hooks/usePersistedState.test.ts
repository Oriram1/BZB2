import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePersistedState } from "./usePersistedState";

const parseKm = (raw: string) => (raw && !Number.isNaN(Number(raw)) ? Number(raw) : null);

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("usePersistedState", () => {
  it("restores a stored value and writes new ones back", () => {
    localStorage.setItem("km", "25");
    const { result } = renderHook(() => usePersistedState("km", 10, parseKm));
    expect(result.current[0]).toBe(25);
    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);
    expect(localStorage.getItem("km")).toBe("3");
  });

  it("uses the default for nothing stored or something unreadable, without overwriting it", () => {
    expect(renderHook(() => usePersistedState("km", 10, parseKm)).result.current[0]).toBe(10);
    localStorage.setItem("km", "far");
    expect(renderHook(() => usePersistedState("km", 10, parseKm)).result.current[0]).toBe(10);
    expect(localStorage.getItem("km")).toBe("far");
  });

  it("keeps working for the session when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => usePersistedState("km", 10, parseKm));
    expect(result.current[0]).toBe(10);
    act(() => result.current[1](7));
    expect(result.current[0]).toBe(7);
  });
});
