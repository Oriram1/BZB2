import { adminClients, auditedAdminAction, findUserByEmail, json, readJsonObject, servePost } from "../_shared/auth.ts";

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

servePost(async (req) => {
  const { user, admin } = await adminClients(req);

  const body = await readJsonObject(req);
  const identifier = String(body.identifier ?? "").trim();
  const newPassword = String(body.newPassword ?? "");
  // The admin screen shows this text as-is, so it stays English until that screen maps error codes.
  if (!identifier || !isStrongPassword(newPassword)) {
    return json({ error: "Password must be at least 8 characters and include letters, numbers, and a special character" }, 400);
  }

  // The target is found by email, or by profile first/last name.
  let targetUserId: string | null = null;
  let targetEmail: string | null = null;

  if (identifier.includes("@")) {
    const match = await findUserByEmail(admin, identifier);
    targetUserId = match?.id ?? null;
    targetEmail = match?.email ?? null;
  } else {
    // Strip filter metacharacters so the name cannot inject PostgREST filter syntax.
    const sanitized = identifier.replace(/[,.*()]/g, "");
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id")
      .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`)
      .limit(2);
    if (profiles?.length === 1) {
      targetUserId = profiles[0].user_id;
    } else if (profiles && profiles.length > 1) {
      return json({ error: "Multiple users match — use email instead" }, 400);
    }
  }

  if (!targetUserId) {
    await auditedAdminAction(
      admin,
      { adminUserId: user.id, action: "reset_password", targetIdentifier: identifier, details: { reason: "user_not_found" } },
      async () => ({ message: "user_not_found" }),
    );
    return json({ error: "User not found" }, 404);
  }

  const userId = targetUserId;
  const reset = await auditedAdminAction(
    admin,
    { adminUserId: user.id, action: "reset_password", targetUserId: userId, targetIdentifier: targetEmail ?? identifier },
    async () => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) console.error("admin_reset_password_failed", error);
      return error;
    },
  );
  if (!reset) return json({ error: "password_reset_failed" }, 500);
  return json({ ok: true, target_user_id: userId });
});
