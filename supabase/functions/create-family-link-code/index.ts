import { authenticatedClients, corsHeaders, errorResponse, hasRole, json } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { emailContent } from "../_shared/notificationCopy.ts";

const CODE_TTL_MS = 10 * 60 * 1000;

async function hashCode(code: string) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    if (!(await hasRole(admin, user.id, "bee"))) return json({ error: "bee_only" }, 403);

    const body = await req.json().catch(() => ({}));
    const parentEmail = String(body.parentEmail ?? "").trim().toLowerCase();
    if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return json({ error: "invalid_email" }, 400);
    }

    await admin
      .from("family_link_codes")
      .delete()
      .or(`expires_at.lt.${new Date().toISOString()},used_at.not.is.null`);

    await admin
      .from("family_link_codes")
      .delete()
      .eq("child_user_id", user.id)
      .is("used_at", null);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
      const displayCode = code.toString().padStart(6, "0");
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const { error } = await admin.from("family_link_codes").insert({
        child_user_id: user.id,
        code_hash: await hashCode(displayCode),
        expires_at: expiresAt,
      });

      if (!error) {
        // Only one unused code exists per child at a time, which caps how often
        // this path can be used to send mail to an arbitrary address.
        let emailed = false;
        if (parentEmail) {
          const { data: profile } = await admin
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", user.id)
            .maybeSingle();

          const childName = profile
            ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
            : "";

          try {
            await sendEmail({
              to: parentEmail,
              tag: "family_link_code",
              content: emailContent({
                id: "family-link",
                event_type: "family_link_code",
                data: { code: displayCode, child_name: childName || "הילד/ה שלך" },
                link: "/parent",
              }),
            });
            emailed = true;
          } catch {
            // The code is valid regardless — the child can still read it aloud.
            emailed = false;
          }
        }
        return json({ code: displayCode, expiresAt, emailed });
      }
      if (error.code !== "23505") return json({ error: "code_creation_failed" }, 500);
    }

    return json({ error: "code_creation_failed" }, 500);
  } catch (error) {
    return errorResponse(error);
  }
});
