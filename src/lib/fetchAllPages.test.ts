import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./fetchAllPages";

describe("fetchAllPages", () => {
  it("loads more than Supabase's single-page row limit", async () => {
    const rows = Array.from({ length: 1001 }, (_, id) => ({ id }));
    const result = await fetchAllPages(async (from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1001);
    expect(result.data.at(-1)?.id).toBe(1000);
  });
});
