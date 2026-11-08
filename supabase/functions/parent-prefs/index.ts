/**
 * Public endpoint: the parent behind a share token edits which emails they get.
 *
 * Writes only the row that token belongs to. parent_contacts has no UPDATE
 * policy and grants nothing to anon, so this function — service_role, token
 * checked first — is the only path in. The read side lives in parent-view,
 * which already loads this row.
 */
import { json, readJsonObject, serviceClient, servePost } from "../_shared/auth.ts";

/** The only columns a parent may set. Anything else in the body is ignored. */
const EDITABLE = [
  "notify_signin",
  "notify_accepted",
  "notify_digest",
  "notify_completed",
  "notify_cancelled",
] as const;

servePost(async (req) => {
  const body = await readJsonObject(req);
  const token = String(body.token ?? "");
  if (!token) return json({ error: "missing_token" }, 400);

  const rawPrefs = body.prefs;
  if (!rawPrefs || typeof rawPrefs !== "object" || Array.isArray(rawPrefs)) {
    return json({ error: "invalid_prefs" }, 400);
  }
  const prefs = rawPrefs as Record<string, unknown>;
  // Allow-list rather than pass-through: a spread of the request body here
  // would let a caller write last_notified_at and reset their own throttle.
  const update: Record<string, boolean> = {};
  for (const key of EDITABLE) {
    if (typeof prefs[key] === "boolean") update[key] = prefs[key] as boolean;
  }
  if (Object.keys(update).length === 0) return json({ error: "no_valid_prefs" }, 400);

  const admin = serviceClient();

  const { data: contact } = await admin
    .from("parent_contacts")
    .select("id")
    .eq("view_token", token)
    .maybeSingle();

  if (!contact) return json({ error: "invalid_token" }, 404);

  const { data: updated, error } = await admin
    .from("parent_contacts")
    .update(update)
    .eq("id", contact.id)
    .select(EDITABLE.join(", "))
    .maybeSingle();

  if (error || !updated) return json({ error: "update_failed" }, 500);

  return json({ prefs: updated });
});
