import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNames, fetchRatings, inBatches } from "./people";

const state = vi.hoisted(() => ({
  profileBatches: [] as string[][],
  ratingRows: [] as { user_id: string; avg_rating: number | null; review_count: number }[],
  ratingError: false,
  role: "",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let ids: string[] = [];
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => { state.role = value; return query; },
        in: (_column: string, batch: string[]) => { ids = batch; if (table === "profiles") state.profileBatches.push(batch); return query; },
        order: () => query,
        range: async () => table === "profiles"
          ? { data: ids.map((id) => ({ user_id: id, first_name: `n${id}`, last_name: "x", age: null, avatar_url: null })), error: null }
          : state.ratingError
            ? { data: null, error: { message: "denied" } }
            : { data: state.ratingRows.filter((row) => ids.includes(row.user_id)), error: null },
      };
      return query;
    },
  },
}));

beforeEach(() => { state.profileBatches = []; state.ratingRows = []; state.ratingError = false; });

describe("inBatches", () => {
  it("splits without losing or repeating an item", () => {
    expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inBatches([], 2)).toEqual([]);
  });
});

describe("fetchNames", () => {
  it("reads each distinct id once, in URL-safe batches", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const names = await fetchNames([...ids, "u0", "u1"]);
    expect(state.profileBatches.map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(names.size).toBe(250);
    expect(names.get("u7")).toBe("nu7 x");
  });

  it("makes no request for an empty list", async () => {
    expect((await fetchNames([])).size).toBe(0);
    expect(state.profileBatches).toEqual([]);
  });
});

describe("fetchRatings", () => {
  it("keeps only users who have an average and at least one review", async () => {
    state.ratingRows = [
      { user_id: "a", avg_rating: 4.5, review_count: 2 },
      { user_id: "b", avg_rating: null, review_count: 0 },
    ];
    const ratings = await fetchRatings("bee", ["a", "b", "c"]);
    expect(ratings).toEqual(new Map([["a", { average: 4.5, count: 2 }]]));
    expect(state.role).toBe("bee");
  });

  it("answers null, not an empty map, when the read fails", async () => {
    state.ratingError = true;
    expect(await fetchRatings("tasker", ["a"])).toBeNull();
  });
});
