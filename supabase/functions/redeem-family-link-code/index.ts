import { authenticatedClients, hasRole, json, readJsonObject, servePost } from "../_shared/auth.ts";
import { DB_RAISE } from "../_shared/dbErrors.ts";
import { childName } from "../_shared/people.ts";
import { MINUTE_MS } from "../_shared/time.ts";
import { hashFamilyCode } from "../_shared/validate.ts";

const ATTEMPT_WINDOW_MS = 10 * MINUTE_MS;
const MAX_ATTEMPTS_PER_WINDOW = 5;

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  if (!(await hasRole(admin, user.id, "parent"))) return json({ error: "parent_only" }, 403);

  const body = await readJsonObject(req);
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code_format" }, 400);

  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("family_link_attempts")
    .select("id", { count: "exact", head: true })
    .eq("parent_user_id", user.id)
    .gte("attempted_at", since);

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) return json({ error: "too_many_attempts" }, 429);

  const codeHash = await hashFamilyCode(code);
  const { data: childId, error } = await admin.rpc("redeem_family_link_code", {
    _parent_user_id: user.id,
    _code_hash: codeHash,
  });
  const success = !error && Boolean(childId);

  await admin.from("family_link_attempts").insert({
    parent_user_id: user.id,
    success,
  });

  if (error?.message.includes(DB_RAISE.selfLinkNotAllowed)) {
    return json({ error: "self_link_not_allowed" }, 400);
  }
  if (!success) return json({ error: "invalid_or_expired_code" }, 404);

  const child = await childName(admin, childId);
  return json({ ok: true, childId, childName: child.name || "הילד" });
});
