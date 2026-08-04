/**
 * Supabase "Send Email Hook".
 *
 * Auth stops sending its own default emails and POSTs here instead, so every
 * auth mail (signup, recovery, magic link, email change, invite, OTP) leaves
 * through the same branded Hebrew template as the rest of the product.
 *
 * Deploy with --no-verify-jwt: Auth calls this server-side, without a user JWT.
 * The Standard Webhooks signature is what authenticates the request.
 */
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { sendEmail, siteUrl, type EmailContent } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, webhook-id, webhook-timestamp, webhook-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type HookPayload = {
  user: { email: string; new_email?: string | null; user_metadata?: Record<string, unknown> | null };
  email_data: {
    token: string;
    token_hash: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
};

function verifyUrl(tokenHash: string, type: string, redirectTo: string) {
  const base = Deno.env.get("SUPABASE_URL");
  const url = new URL(`${base}/auth/v1/verify`);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

/** Copy per auth action. `link` is pre-built; OTP flows use `code` instead. */
function buildContent(
  actionType: string,
  firstName: string,
  link: string,
  code: string,
): EmailContent {
  const greeting = firstName ? `שלום ${firstName},` : "שלום,";
  const ignore = "אם לא ביקשתם את הפעולה הזו, אפשר פשוט להתעלם מהמייל הזה.";

  switch (actionType) {
    case "signup":
      return {
        subject: "אימות כתובת המייל שלכם ב־BZB 🐝",
        preheader: "עוד לחיצה אחת והחשבון שלכם מוכן",
        heading: "ברוכים הבאים ל־BZB!",
        greeting,
        paragraphs: [
          "נשאר רק לאמת את כתובת המייל, וסיימנו.",
          "הקישור תקף ל־24 שעות.",
        ],
        action: { label: "אימות המייל שלי", url: link },
        footnote: ignore,
      };

    case "recovery":
      return {
        subject: "איפוס הסיסמה שלכם ב־BZB",
        preheader: "קישור לבחירת סיסמה חדשה",
        heading: "איפוס סיסמה",
        greeting,
        paragraphs: [
          "קיבלנו בקשה לאיפוס הסיסמה שלכם. לחיצה על הכפתור תוביל לבחירת סיסמה חדשה.",
          "הקישור תקף לשעה אחת.",
        ],
        action: { label: "בחירת סיסמה חדשה", url: link },
        footnote: `${ignore} הסיסמה הנוכחית תישאר בתוקף.`,
      };

    case "magiclink":
    case "magic_link":
      return {
        subject: "קישור הכניסה שלכם ל־BZB",
        preheader: "כניסה מהירה בלי סיסמה",
        heading: "כניסה ל־BZB",
        greeting,
        paragraphs: ["לחיצה על הכפתור תכניס אתכם לחשבון. הקישור תקף לשעה אחת ולשימוש חד־פעמי."],
        action: { label: "כניסה לחשבון", url: link },
        footnote: ignore,
      };

    case "invite":
      return {
        subject: "הוזמנתם ל־BZB 🐝",
        preheader: "מחכה לכם הזמנה לפתיחת חשבון",
        heading: "הוזמנתם להצטרף",
        greeting,
        paragraphs: ["מישהו הזמין אתכם ל־BZB. לחיצה על הכפתור תפתח לכם חשבון."],
        action: { label: "קבלת ההזמנה", url: link },
        footnote: ignore,
      };

    case "email_change":
    case "email_change_new":
      return {
        subject: "אישור שינוי כתובת המייל ב־BZB",
        preheader: "צריך לאשר את הכתובת החדשה",
        heading: "אישור כתובת מייל חדשה",
        greeting,
        paragraphs: ["התקבלה בקשה לשנות את כתובת המייל בחשבון. צריך לאשר כדי להשלים את השינוי."],
        action: { label: "אישור הכתובת", url: link },
        footnote: `${ignore} כדאי לבדוק שהחשבון שלכם מאובטח.`,
      };

    case "reauthentication":
      return {
        subject: `קוד האימות שלכם: ${code}`,
        preheader: "קוד חד־פעמי לאישור הפעולה",
        heading: "קוד אימות",
        greeting,
        paragraphs: ["הקוד הבא נדרש כדי לאשר את הפעולה שביקשתם. הוא תקף לדקות ספורות."],
        code,
        footnote: ignore,
      };

    default:
      return {
        subject: "הודעה מ־BZB",
        preheader: "פעולה בחשבון שלכם",
        heading: "פעולה בחשבון",
        greeting,
        paragraphs: ["התבקשה פעולה בחשבון שלכם."],
        action: { label: "המשך", url: link },
        footnote: ignore,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
  if (!hookSecret || !Deno.env.get("RESEND_API_KEY")) {
    return json({ error: { message: "server_not_configured" } }, 500);
  }

  const payloadText = await req.text();
  const headers = Object.fromEntries(req.headers);

  let payload: HookPayload;
  try {
    const webhook = new Webhook(hookSecret.replace("v1,whsec_", ""));
    payload = webhook.verify(payloadText, headers) as HookPayload;
  } catch {
    return json({ error: { message: "invalid_signature" } }, 401);
  }

  const { user, email_data: data } = payload;
  const actionType = data.email_action_type;
  const firstName = String(user.user_metadata?.first_name ?? "").trim();
  const redirectTo = data.redirect_to || data.site_url || siteUrl();

  try {
    // A secure email change asks both addresses to confirm, so the old address
    // gets token_hash and the new one gets token_hash_new.
    if (actionType === "email_change" && data.token_hash_new && user.new_email) {
      await sendEmail({
        to: user.new_email,
        tag: "auth_email_change_new",
        content: buildContent(
          "email_change_new",
          firstName,
          verifyUrl(data.token_hash_new, "email_change", redirectTo),
          data.token_new ?? "",
        ),
      });
    }

    await sendEmail({
      to: user.email,
      tag: `auth_${actionType}`,
      content: buildContent(
        actionType,
        firstName,
        verifyUrl(data.token_hash, actionType, redirectTo),
        data.token,
      ),
    });

    return json({});
  } catch (error) {
    // A non-2xx tells Auth the send failed so the user sees a real error
    // instead of silently waiting for a mail that never arrives.
    console.error("send_auth_email_failed", error);
    return json({ error: { http_code: 500, message: "email_send_failed" } }, 500);
  }
});
