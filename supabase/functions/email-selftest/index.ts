/**
 * Email self-test.
 *
 * Answers the one question the notification docs say must be answered before
 * trusting mail in production: does a send to an address that is *not* the
 * Resend account owner actually go out? It reports the sender configuration
 * and the verification state of the sending domain, then sends the real
 * branded template to whichever recipients you name.
 *
 * Machine-to-machine: authenticated by a shared secret header, like the other
 * unattended functions, so it can never be triggered by an app user.
 */
import { sendEmail, siteUrl } from "../_shared/email.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Sender domain as Resend sees it: the part after @ in `RESEND_FROM_EMAIL`. */
function fromDomain(from: string) {
  return from.match(/<?([^<>\s]+@([^<>\s]+))>?\s*$/)?.[2] ?? null;
}

async function domainStatus(apiKey: string, domain: string | null) {
  const response = await fetch("https://api.resend.com/domains", {
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    return { error: `domains_lookup_failed:${response.status}` };
  }
  const body = await response.json() as { data?: Array<{ name: string; status: string; region?: string }> };
  const all = (body.data ?? []).map((d) => ({ name: d.name, status: d.status, region: d.region }));
  return { domains: all, sender: all.find((d) => d.name === domain) ?? null };
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("EMAIL_SELFTEST_SECRET");
  if (!secret || request.headers.get("x-selftest-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "server_not_configured", detail: "RESEND_API_KEY missing" }, 500);

  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "BZB <onboarding@resend.dev>";
  const domain = fromDomain(from);
  const config = {
    from,
    domain,
    replyTo: Deno.env.get("RESEND_REPLY_TO") ?? null,
    siteUrl: siteUrl(),
    // The sandbox sender only ever reaches the Resend account owner; every
    // other recipient is rejected. Flag it loudly rather than let a green
    // test to the owner's own inbox look like proof.
    sandboxSender: domain === "resend.dev",
    ...(await domainStatus(apiKey, domain)),
  };

  let recipients: string[] = [];
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({})) as { to?: string | string[] };
    recipients = (Array.isArray(body.to) ? body.to : body.to ? [body.to] : []).filter(Boolean);
  }
  if (!recipients.length) return json({ config, sent: [] });

  const sent = [];
  for (const to of recipients) {
    try {
      const { id } = await sendEmail({
        to,
        tag: "selftest",
        content: {
          subject: "בדיקת שליחה — BZB",
          preheader: "מייל בדיקה מהמערכת של BZB",
          heading: "המיילים עובדים 🐝",
          greeting: "שלום,",
          paragraphs: [
            "זהו מייל בדיקה שנשלח מהמערכת של BZB כדי לוודא שהדומיין השולח מוגדר ופועל.",
            `נשלח מהכתובת ${from} אל ${to}.`,
          ],
          action: { label: "מעבר ל־BZB", url: siteUrl() },
          footnote: "אם קיבלת את המייל הזה בטעות, אפשר להתעלם ממנו.",
        },
      });
      sent.push({ to, ok: true, id });
    } catch (error) {
      sent.push({ to, ok: false, error: String((error as Error).message ?? error) });
    }
  }

  return json({ config, sent });
});
