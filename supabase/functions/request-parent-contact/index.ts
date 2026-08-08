/**
 * Public endpoint: a parent looking at /parent/view/:token asks for their own
 * address to be added to the child's contact list.
 *
 * This does NOT add the contact. It queues a request and notifies the child,
 * who decides. The share token proves the requester was given the link; it does
 * not prove the child wants this person watching them, and only the child can
 * answer that. Keeping the two apart is the whole point of the queue — see the
 * table comment in 20260806220100_parent_contact_prefs_and_requests.sql.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { withCors, json, errorResponse, readJsonObject } from "../_shared/auth.ts";

/** One request per share token per 10 minutes. */
const THROTTLE_MS = 10 * 60 * 1000;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await readJsonObject(req);
    const token = String(body.token ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!token) return json({ error: "missing_token" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "invalid_email" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: contact } = await admin
      .from("parent_contacts")
      .select("child_user_id")
      .eq("view_token", token)
      .maybeSingle();

    if (!contact) return json({ error: "invalid_token" }, 404);
    const childId = contact.child_user_id as string;

    // Already a contact: say so plainly. The caller holds a valid token for this
    // child, so confirming that an address they just typed is on the list tells
    // them nothing they could not learn by watching their own inbox.
    const { data: existing } = await admin
      .from("parent_contacts")
      .select("id")
      .eq("child_user_id", childId)
      .eq("email", email)
      .maybeSingle();
    if (existing) return json({ status: "already_added" });

    // Throttle on the token, not the email, so retyping a different address
    // cannot be used to spam the child's bell.
    const cutoff = new Date(Date.now() - THROTTLE_MS).toISOString();
    const { data: recent } = await admin
      .from("parent_contact_requests")
      .select("id")
      .eq("child_user_id", childId)
      .gt("requested_at", cutoff)
      .limit(1);
    if (recent?.length) return json({ error: "too_soon" }, 429);

    const { error: insertError } = await admin
      .from("parent_contact_requests")
      .insert({ child_user_id: childId, email });

    if (insertError) {
      // A duplicate request is the same outcome as the first one from the
      // requester's point of view: it is pending. Not an error.
      if (insertError.code === "23505") return json({ status: "pending" });
      if (insertError.message.includes("parent_request_limit_reached")) {
        return json({ error: "limit_reached" }, 409);
      }
      return json({ error: "request_failed" }, 500);
    }

    // Reaches the child's bell, email and push through the existing dispatcher.
    // A failure here must not roll back the request — the child will still see
    // it in their profile, they just will not be nudged.
    const { error: notifyError } = await admin.from("notifications").insert({
      user_id: childId,
      event_type: "parent_contact_requested",
      data: { email },
      link: "/profile",
    });
    if (notifyError) {
      console.error("parent_request_notify_failed", { childId, error: notifyError.message });
    }

    return json({ status: "pending" });
  } catch (error) {
    return errorResponse(error);
  }
}));
