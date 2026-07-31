import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";
    if (!supabaseUrl || !serviceKey || !resendKey) return json({ error: "server_not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const redirectTo = String(body.redirectTo ?? "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);
    if (!redirectTo || !/^https?:\/\//i.test(redirectTo)) return json({ error: "invalid_redirect" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    // Do not reveal whether an account exists.
    if (error || !data.properties?.action_link) return json({ ok: true });

    const firstName = String(data.user?.user_metadata?.first_name ?? "").trim();
    const greeting = firstName ? `שלום ${escapeHtml(firstName)},` : "שלום, ";
    const actionLink = data.properties.action_link;
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "איפוס הסיסמה שלך ב־BZB",
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><p>${greeting}</p><p>קיבלנו בקשה לאיפוס הסיסמה שלך.</p><p><a href="${actionLink}" style="display:inline-block;background:#f59e0b;color:#111827;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">איפוס סיסמה</a></p><p>אם לא ביקשת איפוס, אפשר להתעלם מהמייל.</p></div>`,
      }),
    });
    if (!resendResponse.ok) return json({ error: "email_send_failed" }, 502);
    return json({ ok: true });
  } catch {
    return json({ error: "unexpected_error" }, 500);
  }
});
