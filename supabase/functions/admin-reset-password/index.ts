import { adminClients, errorResponse, json, withCors, readJsonObject } from "../_shared/auth.ts";

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

Deno.serve(withCors(async (req) => {

  try {
    const { user, admin } = await adminClients(req);
    const adminUserId = user.id;

    const body = await readJsonObject(req);
    const identifier = String(body.identifier ?? "").trim();
    const newPassword = String(body.newPassword ?? "");
    if (!identifier || !isStrongPassword(newPassword)) {
      return json({ error: "Password must be at least 8 characters and include letters, numbers, and a special character" }, 400);
    }

    // Find target user — by email, or by profile first/last name
    let targetUserId: string | null = null;
    let targetEmail: string | null = null;

    if (identifier.includes("@")) {
      // search auth users by email
      let page = 1;
      while (!targetUserId) {
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
      // search by profile name — use separate ilike calls to avoid filter injection
      const sanitized = identifier.replace(/[,.*()]/g, "");
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, first_name, last_name")
        .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`)
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

    if (updateErr) {
      console.error("admin_reset_password_failed", updateErr);
      return json({ error: "password_reset_failed" }, 500);
    }
    return json({ ok: true, target_user_id: targetUserId });
  } catch (e) {
    return errorResponse(e);
  }
}));
