/**
 * Registers a parent's email against the calling child — no account for the
 * parent, no invitation to accept.
 *
 * Insert and welcome-email live in one function on purpose: the client cannot
 * be trusted to send mail, and doing the insert client-side then calling out
 * for the email leaves a window where the contact exists but was never told.
 */
import { authenticatedClients, hasRole, json, readJsonObject, servePost } from "../_shared/auth.ts";
import { DB_RAISE, UNIQUE_VIOLATION } from "../_shared/dbErrors.ts";
import { childName, mailParentContact } from "../_shared/people.ts";
import { normalizeEmail } from "../_shared/validate.ts";

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  if (!(await hasRole(admin, user.id, "bee"))) return json({ error: "bee_only" }, 403);

  const body = await readJsonObject(req);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid_email" }, 400);

  const { data: inserted, error: insertError } = await admin
    .from("parent_contacts")
    .insert({ child_user_id: user.id, email })
    .select("view_token")
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return json({ error: "already_added" }, 409);
    if (insertError.message.includes(DB_RAISE.parentContactLimit)) {
      return json({ error: "limit_reached" }, 409);
    }
    return json({ error: "insert_failed" }, 500);
  }

  const child = await childName(admin, user.id);

  // The contact is saved either way. A bounced welcome is worth reporting so
  // the child can fix a typo, but it must not undo the link.
  const emailed = await mailParentContact(
    { id: "parent-contact", email, view_token: inserted?.view_token },
    "parent_contact_added",
    { child_name: child.name, child_gender: child.gender },
  );

  return json({ ok: true, emailed });
});
