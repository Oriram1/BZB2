import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { APPLICATION_ERRORS, COMPLETE_TASK_ERRORS, isUniqueViolation, mapDbError, runAction } from "./errors";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("mapDbError", () => {
  it("finds a RAISE EXCEPTION code inside the Postgres message", () => {
    const error = { message: "task_positions_full: CONTEXT: PL/pgSQL function" };
    expect(mapDbError(error, APPLICATION_ERRORS, "generic")).toBe("כל המקומות במטלה כבר תפוסים");
  });

  it("matches a SQLSTATE key against the code, not the message", () => {
    expect(mapDbError({ code: "23505", message: "dup" }, { "23505": "already" }, "generic")).toBe("already");
    expect(mapDbError({ code: "42501", message: "dup" }, { "23505": "already" }, "generic")).toBe("generic");
  });

  it("falls back for unknown, empty or missing errors", () => {
    expect(mapDbError({ message: "boom" }, COMPLETE_TASK_ERRORS, "generic")).toBe("generic");
    expect(mapDbError({}, COMPLETE_TASK_ERRORS, "generic")).toBe("generic");
    expect(mapDbError(null, COMPLETE_TASK_ERRORS, "generic")).toBe("generic");
  });

  it("works on an edge-function error code wrapped as a message", () => {
    expect(mapDbError({ message: "limit_reached" }, { limit_reached: "max 3" }, "generic")).toBe("max 3");
  });
});

it("recognises a unique violation by SQLSTATE only", () => {
  expect(isUniqueViolation({ code: "23505" })).toBe(true);
  expect(isUniqueViolation({ message: "23505" })).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
});

describe("runAction", () => {
  it("returns the result without a toast on success", async () => {
    expect(await runAction(async () => 7, "failed")).toBe(7);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts once and returns undefined when the action throws", async () => {
    const result = await runAction(async () => { throw new Error("x"); }, "failed");
    expect(result).toBeUndefined();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("failed");
  });
});
