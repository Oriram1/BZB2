import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The real thing: signs in as an ordinary account and tries, through the public
 * API with the publishable key, to become an admin and to read a stranger's
 * data. Every request here is expected to FAIL. If one starts succeeding, the
 * "change member to admin and refresh" attack works on this deployment.
 *
 * Skipped unless credentials for a throwaway non-admin account are supplied, so
 * it never runs against production by accident and never creates junk users:
 *
 *   RLS_TEST_EMAIL=... RLS_TEST_PASSWORD=... npm test
 *
 * SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY default to the values in .env.
 */
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.RLS_TEST_EMAIL;
const password = process.env.RLS_TEST_PASSWORD;

const enabled = Boolean(url && key && email && password);
const strangerId = "00000000-0000-0000-0000-000000000000";

describe.skipIf(!enabled)("privilege escalation is refused by the database", () => {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  let userId: string;

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    expect(error, "RLS_TEST_EMAIL/PASSWORD did not sign in").toBeNull();
    userId = data.user!.id;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    expect(
      (roles ?? []).map((row) => row.role),
      "the test account must not already be an admin",
    ).not.toContain("admin");
  });

  it("refuses an admin row inserted by the account itself", async () => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("admin_role_not_self_assignable");
  });

  it("refuses an admin row inserted for somebody else", async () => {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: strangerId, role: "admin" });
    expect(error).not.toBeNull();
  });

  it("refuses to rewrite the account's existing role", async () => {
    const { error } = await supabase
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", userId);
    expect(error).not.toBeNull();
  });

  it("refuses to delete the account's role row", async () => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    expect(error).not.toBeNull();
  });

  it("refuses a second functional role", async () => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "parent" });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("one_role_per_user");
  });

  it("refuses to switch to admin through the sanctioned RPC", async () => {
    const { error } = await supabase.rpc("switch_my_role", { target_role: "admin" });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("role_switch_not_allowed");
  });

  it("refuses to promote the profile row", async () => {
    // Client-side role checks read a profile; the profile must not be writable
    // into a privileged shape even by its own owner.
    const { error } = await supabase
      .from("profiles")
      .update({ user_id: strangerId })
      .eq("user_id", userId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("immutable_profile_fields");
  });

  it("returns nothing when reading another account's role", async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .neq("user_id", userId);
    // RLS filters rather than errors — an empty result is the pass condition,
    // and any row here means role data leaks across accounts.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
