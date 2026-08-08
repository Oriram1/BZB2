import { authenticatedClients, withCors, errorResponse, hasRole, json, readJsonObject } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { formFor, say, SUBJECT } from "../_shared/gender.ts";
import type { User } from "https://esm.sh/@supabase/supabase-js@2.100.0";

async function listAllUsers(admin: Awaited<ReturnType<typeof authenticatedClients>>["admin"]) {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

type AdminClient = Awaited<ReturnType<typeof authenticatedClients>>["admin"];

async function removeUserStorage(admin: AdminClient, userId: string) {
  for (const bucket of ["avatars", "task-images"]) {
    while (true) {
      const { data: files, error: listError } = await admin.storage
        .from(bucket)
        .list(userId, { limit: 100 });
      if (listError) throw listError;
      if (!files || files.length === 0) break;

      const paths = files
        .filter((file) => file.id !== null)
        .map((file) => `${userId}/${file.name}`);
      if (paths.length > 0) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) throw removeError;
      }

      if (files.length < 100 || paths.length === 0) break;
    }
  }
}

async function deleteUserCompletely(admin: AdminClient, userId: string) {
  await removeUserStorage(admin, userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user: callerUser, admin } = await authenticatedClients(req);

    const body = await readJsonObject(req, 64_000);
    const action = String(body.action ?? "list");

    // Self-deletion: any authenticated user can delete their own account.
    if (action === "delete_self") {
      if (await hasRole(admin, callerUser.id, "admin")) {
        return json({ error: "admin_cannot_self_delete" }, 403);
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("first_name, last_name, gender")
        .eq("user_id", callerUser.id)
        .single();
      const displayName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || callerUser.email || "משתמש";
      // The person who just deleted the account is on file, so the emails about
      // it address them by their own gender rather than with a slash form.
      const form = formFor(profile?.gender);
      const deleted = say(form, SUBJECT.deleted);
      const theirs = say(form, SUBJECT.his);

      const { data: parentContacts } = await admin
        .from("parent_contacts")
        .select("email")
        .eq("child_user_id", callerUser.id);

      try {
        await deleteUserCompletely(admin, callerUser.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "self_delete_failed";
        return json({ error: message }, 500);
      }

      const emailTasks: Promise<unknown>[] = [];

      const { data: adminRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRoles?.length) {
        const adminIds = adminRoles.map((r) => r.user_id);
        const { data: adminUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
        const adminEmails = (adminUsers?.users ?? [])
          .filter((u) => adminIds.includes(u.id) && u.email)
          .map((u) => u.email!);

        for (const email of adminEmails) {
          emailTasks.push(
            sendEmail({
              to: email,
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
            }).catch(() => {}),
          );
        }
      }

      for (const contact of parentContacts ?? []) {
        emailTasks.push(
          sendEmail({
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
          }).catch(() => {}),
        );
      }

      await Promise.all(emailTasks);
      return json({ ok: true });
    }

    // All other actions require admin role.
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
      const userIds = [...new Set(requestedIds)].filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      );

      if (userIds.length === 0) return json({ error: "missing_user_ids" }, 400);
      if (userIds.length > 100) return json({ error: "too_many_users" }, 400);
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
        try {
          await deleteUserCompletely(admin, userId);
          deleted.push(userId);
          await admin.from("admin_audit_log").insert({
            admin_user_id: adminUser.id,
            action: "delete_user",
            target_user_id: userId,
            success: true,
            details: { source: "bulk_delete" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "user_delete_failed";
          failed.push({ userId, error: message });
          await admin.from("admin_audit_log").insert({
            admin_user_id: adminUser.id,
            action: "delete_user",
            target_user_id: userId,
            success: false,
            details: { source: "bulk_delete", error: message },
          });
        }
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

      const targetUser = targetUserData.user;
      const metadataRole = String(targetUser.user_metadata?.app_role ?? "");
      const validRole =
        metadataRole === "tasker" || metadataRole === "bee" || metadataRole === "parent"
          ? metadataRole
          : null;

      const { error: confirmError } = await admin.auth.admin.updateUserById(targetUserId, {
        email_confirm: true,
      });

      let roleError: { message: string } | null = null;
      if (!confirmError && validRole) {
        const { error } = await admin
          .from("user_roles")
          .upsert(
            { user_id: targetUserId, role: validRole },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
        roleError = error;
      }

      const operationError = confirmError ?? roleError;
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUser.id,
        action: "confirm_user_email",
        target_user_id: targetUserId,
        success: !operationError,
        details: operationError
          ? { error: operationError.message }
          : { role_repaired: validRole },
      });

      if (operationError) return json({ error: "user_confirmation_failed" }, 500);
      return json({ ok: true });
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
      let deleteError: Error | null = null;
      try {
        await deleteUserCompletely(admin, targetUserId);
      } catch (error) {
        deleteError = error instanceof Error ? error : new Error("user_delete_failed");
      }
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUser.id,
        action: "delete_user",
        target_user_id: targetUserId,
        success: !deleteError,
        details: deleteError ? { error: deleteError.message } : null,
      });
      if (deleteError) return json({ error: "user_delete_failed" }, 500);
      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}));
