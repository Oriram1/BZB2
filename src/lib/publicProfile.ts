import { supabase } from "@/integrations/supabase/client";

/** The one row get_public_profile returns, whichever shape the client hands back. */
export function firstPublicProfile<T>(rows: T | T[] | null | undefined): T | undefined {
  return (Array.isArray(rows) ? rows[0] : rows) ?? undefined;
}

export async function getPublicProfile(userId: string) {
  const { data } = await supabase.rpc("get_public_profile", { _user_id: userId });
  return firstPublicProfile(data);
}
