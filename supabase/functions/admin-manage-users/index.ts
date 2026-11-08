import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { auditedAdminAction, authenticatedClients, hasRole, isUuid, json, listAllUsers, readJsonObject, servePost } from "../_shared/auth.ts";
import { formFor, say, SUBJECT } from "../_shared/gender.ts";
import { childName, tryEmail } from "../_shared/people.ts";

const STORAGE_BUCKETS = ["avatars", "task-images"];
const STORAGE_PAGE_SIZE = 100;
const MAX_BULK_DELETE = 100;
/** 100 years: the auth API has no permanent ban, so "blocked" is a ban that outlasts the account. */
const BLOCK_DURATION = "876000h";

async function removeUserStorage(admin: SupabaseClient, userId: string) {
  for (const bucket of STORAGE_BUCKETS) {
    while (true) {
      const { data: files, error: listError } = await admin.storage
        .from(bucket)
        .list(userId, { limit: STORAGE_PAGE_SIZE });
      if (listError) throw listError;
      if (!files || files.length === 0) break;

      const paths = files
        .filter((file) => file.id !== null)
        .map((file) => `${userId}/${file.name}`);
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) throw removeError;
      }

      if (files.length < STORAGE_PAGE_SIZE || paths.length === 0) break;
    }
  }
}

/** The failure to record in the audit log, or `null` once the user and their files are gone. */
async function deleteUserCompletely(admin: SupabaseClient, userId: string) {
  try {
    await removeUserStorage(admin, userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    return error;
  } catch (error) {
    return { message: error instanceof Error ? error.message : "user_delete_failed" };
  }
}

servePost(async (req) => {
  const { user: callerUser, admin } = await authenticatedClients(req);

  const body = await readJsonObject(req, 64_000);
  const action = String(body.action ?? "list");

  if (action === "delete_self") {
    if (await hasRole(admin, callerUser.id, "admin")) {
      return json({ error: "admin_cannot_self_delete" }, 403);
    }

    const { name, gender } = await childName(admin, callerUser.id);
    const displayName = name || callerUser.email || "משתמש";
    const form = formFor(gender);
    const deleted = say(form, SUBJECT.deleted);
    const theirs = say(form, SUBJECT.his);

    const { data: parentContacts } = await admin
      .from("parent_contacts")
      .select("email")
      .eq("child_user_id", callerUser.id);

    const failure = await deleteUserCompletely(admin, callerUser.id);
    if (failure) {
      console.error("self_delete_failed", failure.message);
      return json({ error: "self_delete_failed" }, 500);
    }

    const { data: adminRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminLookups = await Promise.all(
      (adminRoles ?? []).map((role) => admin.auth.admin.getUserById(role.user_id)),
    );
    const adminEmails = adminLookups.flatMap(({ data }) => (data.user?.email ? [data.user.email] : []));

    await Promise.all([
      ...adminEmails.map((to) =>
        tryEmail({
          to,
          tag: "account_deleted_admin",
          content: {
            subject: `חשבון נמחק — ${displayName}`,
            preheader: `${displayName} ${deleted} את החשבון ${theirs}`,
            heading: "חשבון נמחק מהמערכת",
            paragraphs: [
              `${say(form, SUBJECT.user)} ${displayName} (${callerUser.email ?? "ללא מייל"}) ${deleted} את החשבון ${theirs}.`,
              "כל המידע נמחק לצמיתות.",
            ],
          },
        })
      ),
      ...(parentContacts ?? []).map((contact) =>
        tryEmail({
          to: contact.email,
          tag: "account_deleted_parent",
          content: {
            subject: `${displayName} ${deleted} את החשבון ב-BZB`,
            preheader: `${displayName} ${deleted} את החשבון`,
            heading: "החשבון נמחק",
            paragraphs: [
              `רצינו לעדכן אותך ש-${displayName} ${deleted} את החשבון ${theirs} במערכת BZB.`,
              `כל המידע ${theirs} נמחק לצמיתות מהמערכת.`,
            ],
          },
        })
      ),
    ]);
    return json({ ok: true });
  }

  const adminUser = callerUser;
  if (!(await hasRole(admin, adminUser.id, "admin"))) throw new Error("forbidden");

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
          emailConfirmed: Boolean(authUser.email_confirmed_at),
          blocked: authUser.banned_until
            ? new Date(authUser.banned_until).getTime() > Date.now()
            : false,
        };
      }),
    });
  }

  if (action === "delete_many") {
    const requestedIds = Array.isArray(body.userIds)
      ? body.userIds.map((value: unknown) => String(value))
      : [];
    const userIds = [...new Set(requestedIds)].filter(isUuid);

    if (userIds.length === 0) return json({ error: "missing_user_ids" }, 400);
    if (userIds.length > MAX_BULK_DELETE) return json({ error: "too_many_users" }, 400);
    if (userIds.includes(adminUser.id)) return json({ error: "cannot_manage_self" }, 400);

    const { data: protectedRoles } = await admin
      .from("user_roles")
      .select("user_id")
      .in("user_id", userIds)
      .eq("role", "admin");
    if ((protectedRoles ?? []).length > 0) {
      return json({ error: "cannot_manage_admin" }, 403);
    }

    const deleted: string[] = [];
    const failed: { userId: string; error: string }[] = [];

    for (const userId of userIds) {
      const ok = await auditedAdminAction(
        admin,
        { adminUserId: adminUser.id, action: "delete_user", targetUserId: userId, details: { source: "bulk_delete" } },
        () => deleteUserCompletely(admin, userId),
      );
      if (ok) deleted.push(userId);
      else failed.push({ userId, error: "user_delete_failed" });
    }

    return json({ ok: failed.length === 0, deleted, failed });
  }

  const targetUserId = String(body.userId ?? "");
  if (!targetUserId) return json({ error: "missing_user_id" }, 400);
  if (targetUserId === adminUser.id) return json({ error: "cannot_manage_self" }, 400);
  if (await hasRole(admin, targetUserId, "admin")) {
    return json({ error: "cannot_manage_admin" }, 403);
  }

  if (action === "confirm_email") {
    const { data: targetUserData, error: getUserError } =
      await admin.auth.admin.getUserById(targetUserId);
    if (getUserError || !targetUserData.user) {
      return json({ error: "user_not_found" }, 404);
    }

    // Signup stores the chosen role in metadata; if the role row never landed, confirming repairs it.
    const metadataRole = String(targetUserData.user.user_metadata?.app_role ?? "");
    const validRole =
      metadataRole === "tasker" || metadataRole === "bee" || metadataRole === "parent"
        ? metadataRole
        : null;

    const confirmed = await auditedAdminAction(
      admin,
      { adminUserId: adminUser.id, action: "confirm_user_email", targetUserId, details: { role_repaired: validRole } },
      async () => {
        const { error: confirmError } = await admin.auth.admin.updateUserById(targetUserId, { email_confirm: true });
        if (confirmError || !validRole) return confirmError;
        const { error: roleError } = await admin
          .from("user_roles")
          .upsert(
            { user_id: targetUserId, role: validRole },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
        return roleError;
      },
    );
    if (!confirmed) return json({ error: "user_confirmation_failed" }, 500);
    return json({ ok: true });
  }

  if (action === "block" || action === "unblock") {
    const updated = await auditedAdminAction(
      admin,
      { adminUserId: adminUser.id, action: action === "block" ? "block_user" : "unblock_user", targetUserId },
      async () => {
        const { error } = await admin.auth.admin.updateUserById(targetUserId, {
          ban_duration: action === "block" ? BLOCK_DURATION : "none",
        });
        return error;
      },
    );
    if (!updated) return json({ error: "user_update_failed" }, 500);
    return json({ ok: true });
  }

  if (action === "delete") {
    const removed = await auditedAdminAction(
      admin,
      { adminUserId: adminUser.id, action: "delete_user", targetUserId },
      () => deleteUserCompletely(admin, targetUserId),
    );
    if (!removed) return json({ error: "user_delete_failed" }, 500);
    return json({ ok: true });
  }

  return json({ error: "invalid_action" }, 400);
});
