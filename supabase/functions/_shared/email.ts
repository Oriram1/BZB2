/**
 * Shared transactional email layer.
 *
 * Every mail BZB sends — auth, notifications, digests — renders through
 * `renderEmail` and ships through `sendEmail`, so branding, RTL handling and
 * the plain-text twin can never drift apart between call sites.
 */

const BRAND = {
  name: "BZB",
  honey: "#FF791A",
  honeyMid: "#FFC61A",
  honeyDeep: "#FF9500",
  ink: "#231B12",
  linkInk: "#A34400",
  text: "#1C1917",
  muted: "#78716C",
  card: "#FFFFFF",
  page: "#F5F5F4",
  border: "#E7E5E4",
} as const;

export type EmailAction = { label: string; url: string };

/** `url` turns the card title into a link — used by digests that summarise
 *  several separate things, each with its own destination. */
export type EmailCard = { title: string; lines: string[]; url?: string };

export type EmailContent = {
  subject: string;
  /** Preview line email clients show next to the subject. */
  preheader: string;
  heading: string;
  greeting?: string;
  paragraphs?: string[];
  bullets?: string[];
  cards?: EmailCard[];
  action?: EmailAction;
  /** One-time code, rendered instead of a link. */
  code?: string;
  footnote?: string;
  /** Link to the notification-preferences screen, shown in the footer. */
  manageUrl?: string;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export function siteUrl() {
  return (Deno.env.get("PUBLIC_SITE_URL") ?? "https://bzb-web.com").replace(/\/$/, "");
}

/**
 * Bulletproof CTA: VML for Outlook (which ignores padded anchors), a padded
 * anchor everywhere else, and a bare URL underneath for clients that strip
 * both. Users who cannot click still have something to copy.
 */
function renderButton(action: EmailAction) {
  const url = escapeHtml(action.url);
  const label = escapeHtml(action.label);
  return `
  <tr>
    <td align="center" style="padding:8px 0 4px">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="44%" stroke="f" fillcolor="${BRAND.honey}">
        <w:anchorlock/>
        <center style="color:${BRAND.ink};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${url}" style="display:inline-block;background:${BRAND.honey};background-image:linear-gradient(135deg,${BRAND.honey},${BRAND.honeyMid});color:${BRAND.ink};font-size:16px;font-weight:bold;text-decoration:none;padding:14px 34px;border-radius:24px;font-family:Arial,Helvetica,sans-serif">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
  <tr>
    <td align="center" class="bzb-muted" style="padding:6px 0 0;font-size:12px;color:${BRAND.muted};line-height:1.6">
      אם הכפתור לא עובד, אפשר להעתיק את הקישור:<br />
      <span style="direction:ltr;unicode-bidi:embed;word-break:break-all;color:${BRAND.linkInk}">${url}</span>
    </td>
  </tr>`;
}

function renderCode(code: string) {
  return `
  <tr>
    <td align="center" style="padding:8px 0">
      <div class="bzb-code" style="display:inline-block;background:${BRAND.page};border:1px solid ${BRAND.border};border-radius:16px;padding:16px 32px;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;letter-spacing:8px;direction:ltr;color:${BRAND.text}">${escapeHtml(code)}</div>
    </td>
  </tr>`;
}

function renderCards(cards: EmailCard[]) {
  return cards
    .map(
      (card) => `
  <tr>
    <td style="padding:6px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bzb-inset" style="background:${BRAND.page};border:1px solid ${BRAND.border};border-radius:16px">
        <tr>
          <td style="padding:16px 18px;text-align:right">
            <div class="bzb-text" style="font-size:16px;font-weight:bold;color:${BRAND.text};padding-bottom:6px">${
              card.url
                ? `<a href="${escapeHtml(card.url)}" style="color:${BRAND.linkInk};text-decoration:underline">${escapeHtml(card.title)}</a>`
                : escapeHtml(card.title)
            }</div>
            ${card.lines
              .map(
                (line) =>
                  `<div class="bzb-muted" style="font-size:14px;color:${BRAND.muted};line-height:1.8">${escapeHtml(line)}</div>`,
              )
              .join("")}
          </td>
        </tr>
      </table>
    </td>
  </tr>`,
    )
    .join("");
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const rows: string[] = [];

  if (content.greeting) {
    rows.push(`
  <tr><td class="bzb-text" style="padding:0 0 4px;font-size:16px;color:${BRAND.text};text-align:right">${escapeHtml(content.greeting)}</td></tr>`);
  }

  for (const paragraph of content.paragraphs ?? []) {
    rows.push(`
  <tr><td class="bzb-text" style="padding:6px 0;font-size:16px;line-height:1.8;color:${BRAND.text};text-align:right">${escapeHtml(paragraph)}</td></tr>`);
  }

  if (content.bullets?.length) {
    const items = content.bullets
      .map(
        (bullet) =>
          `<div class="bzb-text" style="font-size:15px;line-height:1.9;color:${BRAND.text}">🐝 ${escapeHtml(bullet)}</div>`,
      )
      .join("");
    rows.push(`<tr><td style="padding:6px 0;text-align:right">${items}</td></tr>`);
  }

  if (content.cards?.length) rows.push(renderCards(content.cards));
  if (content.code) rows.push(renderCode(content.code));
  if (content.action) rows.push(renderButton(content.action));

  if (content.footnote) {
    rows.push(`
  <tr><td class="bzb-muted" style="padding:14px 0 0;font-size:13px;line-height:1.7;color:${BRAND.muted};text-align:right">${escapeHtml(content.footnote)}</td></tr>`);
  }

  const manageRow = content.manageUrl
    ? `<div style="padding-top:6px"><a href="${escapeHtml(content.manageUrl)}" style="color:${BRAND.linkInk};text-decoration:underline">ניהול העדפות ההתראה שלך</a></div>`
    : "";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="he" dir="rtl">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(content.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  @media (prefers-color-scheme: dark) {
    .bzb-page { background:#1C1917 !important; }
    .bzb-card { background:#292524 !important; border-color:#44403C !important; }
    .bzb-inset { background:#1C1917 !important; border-color:#44403C !important; }
    .bzb-code { background:#1C1917 !important; border-color:#44403C !important; color:#E7E5E4 !important; }
    .bzb-text { color:#E7E5E4 !important; }
    .bzb-muted { color:#A8A29E !important; }
  }
  @media only screen and (max-width:620px) {
    .bzb-card-pad { padding:24px 20px !important; }
  }
</style>
</head>
<body class="bzb-page" style="margin:0;padding:0;background:${BRAND.page};direction:rtl">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bzb-page" style="background:${BRAND.page};padding:24px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

        <tr>
          <td align="center" style="padding:0 0 18px">
            <span style="font-size:26px;font-weight:bold;letter-spacing:1px;color:${BRAND.linkInk};font-family:Arial,Helvetica,sans-serif">${BRAND.name} 🐝</span>
          </td>
        </tr>

        <tr>
          <td class="bzb-card" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:24px;overflow:hidden">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="6" style="height:6px;font-size:0;line-height:0;background:${BRAND.honey};background-image:linear-gradient(90deg,${BRAND.honey},${BRAND.honeyMid},${BRAND.honeyDeep})">&nbsp;</td>
              </tr>
              <tr>
                <td class="bzb-card-pad" style="padding:32px 34px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif">
                    <tr>
                      <td class="bzb-text" style="padding:0 0 12px;font-size:22px;font-weight:bold;color:${BRAND.text};text-align:right">${escapeHtml(content.heading)}</td>
                    </tr>
                    ${rows.join("")}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="bzb-muted" align="center" style="padding:18px 12px 0;font-size:12px;line-height:1.8;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif">
            נשלח מ־${BRAND.name} — מטלות ועבודות לנוער
            ${manageRow}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textParts: string[] = [content.heading, ""];
  if (content.greeting) textParts.push(content.greeting, "");
  for (const paragraph of content.paragraphs ?? []) textParts.push(paragraph, "");
  for (const bullet of content.bullets ?? []) textParts.push(`- ${bullet}`);
  if (content.bullets?.length) textParts.push("");
  for (const card of content.cards ?? []) {
    textParts.push(card.title, ...card.lines.map((line) => `  ${line}`));
    if (card.url) textParts.push(`  ${card.url}`);
    textParts.push("");
  }
  if (content.code) textParts.push(`הקוד שלך: ${content.code}`, "");
  if (content.action) textParts.push(`${content.action.label}: ${content.action.url}`, "");
  if (content.footnote) textParts.push(content.footnote, "");
  textParts.push(`— ${BRAND.name}`);
  if (content.manageUrl) textParts.push(`ניהול העדפות התראה: ${content.manageUrl}`);

  return { html, text: textParts.join("\n").trim() };
}

/** Resend tag values only accept ASCII letters, digits, underscore and dash. */
function safeTag(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
}

export async function sendEmail(options: {
  to: string;
  content: EmailContent;
  /** Grouping label for Resend analytics, e.g. "application_received". */
  tag?: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("server_not_configured");

  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "BZB <onboarding@resend.dev>";
  const replyTo = Deno.env.get("RESEND_REPLY_TO");
  const { html, text } = renderEmail(options.content);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.content.subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(options.tag ? { tags: [{ name: "kind", value: safeTag(options.tag) }] } : {}),
      // Stops Gmail collapsing repeated notifications into one thread.
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`email_send_failed:${response.status}:${detail.slice(0, 200)}`);
  }

  // Resend's message id — the handle you need to look a send up in their
  // dashboard when someone reports a mail that never arrived.
  const body = await response.json().catch(() => null) as { id?: string } | null;
  return { id: body?.id ?? null };
}
