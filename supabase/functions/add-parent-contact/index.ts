/**
 * Registers a parent's email against the calling child — no account for the
 * parent, no invitation to accept.
 *
 * Insert and welcome-email live in one function on purpose: the client cannot
 * be trusted to send mail, and doing the insert client-side then calling out
 * for the email leaves a window where the contact exists but was never told.
 */
import { authenticatedClients, withCors, errorResponse, hasRole, json } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailContent } from "../_shared/notificationCopy.ts";

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, user.id, "bee"))) return json({ error: "bee_only" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_email" }, 400);
    }

    const { error: insertError } = await admin
      .from("parent_contacts")
      .insert({ child_user_id: user.id, email });

    if (insertError) {
      if (insertError.code === "23505") return json({ error: "already_added" }, 409);
      if (insertError.message.includes("parent_contact_limit_reached")) {
        return json({ error: "limit_reached" }, 409);
      }
      return json({ error: "insert_failed" }, 500);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, gender")
      .eq("user_id", user.id)
      .maybeSingle();

    // Left empty when unknown so the copy layer picks the gendered fallback
    // rather than this file hard-coding a slash form.
    const childName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

    // The contact is saved either way. A bounced welcome is worth reporting so
    // the child can fix a typo, but it must not undo the link.
    let emailed = false;
    try {
      await sendEmail({
        to: email,
        tag: "parent_contact_added",
        content: emailContent({
          id: "parent-contact",
          event_type: "parent_contact_added",
          data: { child_name: childName, child_gender: profile?.gender },
          link: "/",
        }),
      });
      emailed = true;
    } catch {
      emailed = false;
    }

    return json({ ok: true, emailed });
  } catch (error) {
    return errorResponse(error);
  }
}));
