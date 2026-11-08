import { authenticatedClients, hasRole, json, readJsonObject, servePost } from "../_shared/auth.ts";
import { emailContent } from "../_shared/notificationCopy.ts";
import { UNIQUE_VIOLATION } from "../_shared/dbErrors.ts";
import { childName, tryEmail } from "../_shared/people.ts";
import { MINUTE_MS } from "../_shared/time.ts";
import { hashFamilyCode, normalizeEmail } from "../_shared/validate.ts";

const CODE_TTL_MS = 10 * MINUTE_MS;
const CODE_ATTEMPTS = 5;

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  if (!(await hasRole(admin, user.id, "bee"))) return json({ error: "bee_only" }, 403);

  const body = await readJsonObject(req);
  // The parent's address is optional: a blank one just skips the email.
  const parentEmail = normalizeEmail(body.parentEmail);
  if (!parentEmail && String(body.parentEmail ?? "").trim()) return json({ error: "invalid_email" }, 400);

  await admin
    .from("family_link_codes")
    .delete()
    .or(`expires_at.lt.${new Date().toISOString()},used_at.not.is.null`);

  await admin
    .from("family_link_codes")
    .delete()
    .eq("child_user_id", user.id)
    .is("used_at", null);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const displayCode = code.toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await admin.from("family_link_codes").insert({
      child_user_id: user.id,
      code_hash: await hashFamilyCode(displayCode),
      expires_at: expiresAt,
    });

    if (!error) {
      // Only one unused code exists per child at a time, which caps how often
      // this path can be used to send mail to an arbitrary address.
      // The code is valid regardless — the child can still read it aloud.
      let emailed = false;
      if (parentEmail) {
        const child = await childName(admin, user.id);
        emailed = await tryEmail({
          to: parentEmail,
          tag: "family_link_code",
          content: emailContent({
            id: "family-link",
            event_type: "family_link_code",
            data: { code: displayCode, child_name: child.name, child_gender: child.gender },
            link: "/parent",
          }),
        });
      }
      return json({ code: displayCode, expiresAt, emailed });
    }
    if (error.code !== UNIQUE_VIOLATION) return json({ error: "code_creation_failed" }, 500);
  }

  return json({ error: "code_creation_failed" }, 500);
});
