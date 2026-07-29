import { authenticatedClients, corsHeaders, errorResponse, hasRole, json } from "../_shared/auth.ts";

const CODE_TTL_MS = 10 * 60 * 1000;

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
    if (!(await hasRole(admin, user.id, "bee"))) return json({ error: "bee_only" }, 403);

    await admin
      .from("family_link_codes")
      .delete()
      .or(`expires_at.lt.${new Date().toISOString()},used_at.not.is.null`);

    await admin
      .from("family_link_codes")
      .delete()
      .eq("child_user_id", user.id)
      .is("used_at", null);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
      const displayCode = code.toString().padStart(6, "0");
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const { error } = await admin.from("family_link_codes").insert({
        child_user_id: user.id,
        code_hash: await hashCode(displayCode),
        expires_at: expiresAt,
      });

      if (!error) return json({ code: displayCode, expiresAt });
      if (error.code !== "23505") return json({ error: "code_creation_failed" }, 500);
    }

    return json({ error: "code_creation_failed" }, 500);
  } catch (error) {
    return errorResponse(error);
  }
});
