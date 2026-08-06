/**
 * Tells a child's parent contacts that the child just signed in.
 *
 * The recipients here have no account, so nothing goes through
 * public.notifications (keyed by user_id) or push — this mails them directly.
 *
 * The client calls this on sign-in, which means it is called far more often
 * than it should send. The throttle below, not the caller, decides what
 * actually goes out: one email per contact per 24h. A repeat call is a no-op,
 * so a refreshed tab or a second device costs nothing.
 */
import { authenticatedClients, withCors, errorResponse, hasRole, json } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailContent } from "../_shared/notificationCopy.ts";

const THROTTLE_MS = 24 * 60 * 60 * 1000;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);

    // Only a child account has parents to notify. Anyone else is a quiet no-op
    // rather than an error — the client fires this for every sign-in.
    if (!(await hasRole(admin, user.id, "bee"))) return json({ notified: 0 });

    const cutoff = new Date(Date.now() - THROTTLE_MS).toISOString();
    const { data: contacts } = await admin
      .from("parent_contacts")
      .select("id, email, last_notified_at")
      .eq("child_user_id", user.id)
      .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`);

    if (!contacts?.length) return json({ notified: 0 });

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, gender")
      .eq("user_id", user.id)
      .maybeSingle();

    // Left empty when unknown so the copy layer picks the gendered fallback
    // rather than this file hard-coding a slash form.
    const childName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    const signedInAt = new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    }).format(new Date());

    let notified = 0;
    for (const contact of contacts) {
      try {
        await sendEmail({
          to: contact.email,
          tag: "child_signed_in",
          content: emailContent({
            id: contact.id,
            event_type: "child_signed_in",
            data: { child_name: childName, signed_in_at: signedInAt, child_gender: profile?.gender },
            link: "/",
          }),
        });
        // Stamped only on success, so a failed send is retried next sign-in
        // instead of being silently swallowed for a day.
        const { error: stampError } = await admin
          .from("parent_contacts")
          .update({ last_notified_at: new Date().toISOString() })
          .eq("id", contact.id);
        if (stampError) {
          console.error("parent_notification_stamp_failed", {
            contactId: contact.id,
            error: stampError.message,
          });
        }
        notified += 1;
      } catch (error) {
        // One bad address must not stop the rest.
        console.error("parent_notification_send_failed", {
          contactId: contact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json({ notified });
  } catch (error) {
    return errorResponse(error);
  }
}));
