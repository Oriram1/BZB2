/**
 * Public endpoint: the parent behind a share token removes themselves.
 *
 * Children cannot delete parent_contacts rows (no DELETE policy or grant), so
 * this service_role function — token checked first — is the only path. It
 * deletes exactly the row that token belongs to.
 */
import { json, readJsonObject, serviceClient, servePost } from "../_shared/auth.ts";

servePost(async (req) => {
  const body = await readJsonObject(req);
  const token = String(body.token ?? "");
  if (!token) return json({ error: "missing_token" }, 400);

  const admin = serviceClient();
  const { data: contact } = await admin
    .from("parent_contacts")
    .select("id")
    .eq("view_token", token)
    .maybeSingle();
  if (!contact) return json({ error: "invalid_token" }, 404);

  const { error } = await admin.from("parent_contacts").delete().eq("id", contact.id);
  if (error) return json({ error: "delete_failed" }, 500);

  return json({ ok: true });
});
