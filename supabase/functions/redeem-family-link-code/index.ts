import { authenticatedClients, corsHeaders, errorResponse, hasRole, json } from "../_shared/auth.ts";

async function hashCode(code: string) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, user.id, "parent"))) return json({ error: "parent_only" }, 403);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code_format" }, 400);

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("family_link_attempts")
      .select("id", { count: "exact", head: true })
      .eq("parent_user_id", user.id)
      .gte("attempted_at", since);

    if ((count ?? 0) >= 5) return json({ error: "too_many_attempts" }, 429);

    const codeHash = await hashCode(code);
    const { data: childId, error } = await admin.rpc("redeem_family_link_code", {
      _parent_user_id: user.id,
      _code_hash: codeHash,
    });
    const success = !error && Boolean(childId);

    await admin.from("family_link_attempts").insert({
      parent_user_id: user.id,
      success,
    });

    if (error?.message.includes("self_link_not_allowed")) {
      return json({ error: "self_link_not_allowed" }, 400);
    }
    if (!success) return json({ error: "invalid_or_expired_code" }, 404);

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", childId)
      .maybeSingle();
    const childName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "הילד";

    return json({ ok: true, childId, childName });
  } catch (error) {
    return errorResponse(error);
  }
});
