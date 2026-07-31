import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isStrongPassword(password: string) {
  return password.length >= 6 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    // Verify caller identity
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Unauthorized" }, 401);
    const adminUserId = userRes.user.id;

    // Verify admin role
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier ?? "").trim();
    const newPassword = String(body.newPassword ?? "");
    if (!identifier || !isStrongPassword(newPassword)) {
      return json({ error: "Password must be at least 6 characters and include letters, numbers, and a special character" }, 400);
    }

    // Find target user — by email, or by profile first/last name
    let targetUserId: string | null = null;
    let targetEmail: string | null = null;

    if (identifier.includes("@")) {
      // search auth users by email
      let page = 1;
      while (page <= 20 && !targetUserId) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        const match = data.users.find(
          (u) => (u.email ?? "").toLowerCase() === identifier.toLowerCase()
        );
        if (match) {
          targetUserId = match.id;
          targetEmail = match.email ?? null;
          break;
        }
        if (data.users.length < 200) break;
        page++;
      }
    } else {
      // search by profile name
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, first_name, last_name")
        .or(`first_name.ilike.${identifier},last_name.ilike.${identifier}`)
        .limit(2);
      if (profiles && profiles.length === 1) {
        targetUserId = profiles[0].user_id;
      } else if (profiles && profiles.length > 1) {
        return json({ error: "Multiple users match — use email instead" }, 400);
      }
    }

    if (!targetUserId) {
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUserId,
        action: "reset_password",
        target_identifier: identifier,
        success: false,
        details: { reason: "user_not_found" },
      });
      return json({ error: "User not found" }, 404);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });

    await admin.from("admin_audit_log").insert({
      admin_user_id: adminUserId,
      action: "reset_password",
      target_user_id: targetUserId,
      target_identifier: targetEmail ?? identifier,
      success: !updateErr,
      details: updateErr ? { error: updateErr.message } : null,
    });

    if (updateErr) return json({ error: updateErr.message }, 500);
    return json({ ok: true, target_user_id: targetUserId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
