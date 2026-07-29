import { authenticatedClients, corsHeaders, errorResponse, hasRole, json } from "../_shared/auth.ts";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.100.0";

async function listAllUsers(admin: Awaited<ReturnType<typeof authenticatedClients>>["admin"]) {
  const users: User[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user: adminUser, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, adminUser.id, "admin"))) throw new Error("forbidden");

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list");

    if (action === "list") {
      const authUsers = await listAllUsers(admin);
      const ids = authUsers.map((user) => user.id);
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        admin.from("profiles").select("user_id, first_name, last_name, age, created_at").in("user_id", ids),
        admin.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);

      const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      const rolesById = (roles ?? []).reduce<Record<string, string[]>>((acc, row) => {
        acc[row.user_id] = [...(acc[row.user_id] ?? []), row.role];
        return acc;
      }, {});

      return json({
        users: authUsers.map((authUser) => {
          const profile = profileById.get(authUser.id);
          const metadataFirstName = String(authUser.user_metadata?.first_name ?? "").trim();
          const metadataLastName = String(authUser.user_metadata?.last_name ?? "").trim();
          const firstName = profile?.first_name?.trim() || metadataFirstName;
          const lastName = profile?.last_name?.trim() || metadataLastName;
          return {
            id: authUser.id,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`.trim() || authUser.email || "משתמש ללא שם",
            email: authUser.email ?? "",
            age: profile?.age ?? null,
            createdAt: authUser.created_at,
            roles: rolesById[authUser.id] ?? [],
            blocked: authUser.banned_until
              ? new Date(authUser.banned_until).getTime() > Date.now()
              : false,
          };
        }),
      });
    }

    const targetUserId = String(body.userId ?? "");
    if (!targetUserId) return json({ error: "missing_user_id" }, 400);
    if (targetUserId === adminUser.id) return json({ error: "cannot_manage_self" }, 400);
    if (await hasRole(admin, targetUserId, "admin")) {
      return json({ error: "cannot_manage_admin" }, 403);
    }

    if (action === "block" || action === "unblock") {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: action === "block" ? "876000h" : "none",
      });
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUser.id,
        action: action === "block" ? "block_user" : "unblock_user",
        target_user_id: targetUserId,
        success: !error,
        details: error ? { error: error.message } : null,
      });
      if (error) return json({ error: "user_update_failed" }, 500);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUser.id,
        action: "delete_user",
        target_user_id: targetUserId,
        success: !error,
        details: error ? { error: error.message } : null,
      });
      if (error) return json({ error: "user_delete_failed" }, 500);
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});
