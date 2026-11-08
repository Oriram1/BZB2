import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { displayName } from "@/lib/format";

/** `.in()` puts every id in the URL, so long lists go out in batches. */
const ID_BATCH = 100;

export function inBatches<T>(items: T[], size = ID_BATCH): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

export interface ProfileCard {
  user_id: string;
  first_name: string;
  last_name: string;
  age: number | null;
  avatar_url: string | null;
}

/** Profiles by user id in one batched read. `failed` means some batch could not be read. */
export async function fetchProfiles(ids: string[]): Promise<{ byId: Map<string, ProfileCard>; failed: boolean }> {
  const byId = new Map<string, ProfileCard>();
  let failed = false;
  for (const batch of inBatches([...new Set(ids)])) {
    const { data, error } = await fetchAllPages((from, to) => supabase.from("profiles")
      .select("user_id, first_name, last_name, age, avatar_url")
      .in("user_id", batch).order("user_id").range(from, to));
    if (error) failed = true;
    for (const profile of data) byId.set(profile.user_id, profile);
  }
  return { byId, failed };
}

/** Display names by user id; an id whose profile cannot be read is simply absent. */
export async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const { byId } = await fetchProfiles(ids);
  return new Map([...byId].map(([id, profile]) => [id, displayName(profile)]));
}

export interface Rating {
  average: number;
  count: number;
}

/**
 * Approved-review averages for one side of the marketplace. A user with no
 * reviews is absent from the map; null means the read failed and the caller
 * should say "unknown", not "no ratings".
 */
export async function fetchRatings(role: "tasker" | "bee", ids: string[]): Promise<Map<string, Rating> | null> {
  const ratings = new Map<string, Rating>();
  for (const batch of inBatches([...new Set(ids)])) {
    const { data, error } = await fetchAllPages((from, to) => supabase.from("user_role_ratings")
      .select("user_id, avg_rating, review_count").eq("reviewee_role", role).in("user_id", batch)
      .order("user_id").range(from, to));
    if (error) return null;
    for (const row of data) {
      if (row.avg_rating != null && row.review_count) {
        ratings.set(row.user_id, { average: Number(row.avg_rating), count: Number(row.review_count) });
      }
    }
  }
  return ratings;
}
