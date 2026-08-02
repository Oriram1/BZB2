/**
 * Wording for every notification, in one place.
 *
 * The database stores `event_type` + `data` only, so this module is the single
 * source of truth for what a user actually reads — in email and in push alike.
 */
import { siteUrl, type EmailContent } from "./email.ts";

export type NotificationEvent =
  | "application_received"
  | "application_decided"
  | "message_received"
  | "task_completed"
  | "parent_child_accepted"
  | "parent_digest"
  | "family_link_code"
  | "quiet_hours_digest"
  | "task_cancelled";

export type NotificationRow = {
  id: string;
  event_type: NotificationEvent;
  data: Record<string, unknown>;
  link: string | null;
};

export type PushPayload = { title: string; body: string; url: string; tag: string };

const str = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

function shekels(data: Record<string, unknown>) {
  const amount = Number(data.payment);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const unit = data.payment_type === "hour" ? "לשעה" : "למשימה";
  return `₪${amount.toLocaleString("he-IL")} ${unit}`;
}

function when(data: Record<string, unknown>) {
  const date = str(data.scheduled_date);
  const time = str(data.scheduled_time).slice(0, 5);
  return [date, time].filter(Boolean).join(" בשעה ");
}

export function emailContent(row: NotificationRow): EmailContent {
  const base = siteUrl();
  const data = row.data ?? {};
  const url = `${base}${row.link ?? "/"}`;
  const manageUrl = `${base}/settings`;

  switch (row.event_type) {
    case "application_received": {
      const name = str(data.applicant_name, "מועמד/ת");
      const task = str(data.task_name, "המטלה שלך");
      return {
        subject: `${name} הגיש/ה מועמדות ל"${task}" 🐝`,
        preheader: `מועמדות חדשה מחכה לתשובה שלך`,
        heading: "יש לך מועמדות חדשה",
        paragraphs: [`${name} הגיש/ה מועמדות למטלה "${task}".`, "אפשר לאשר או לדחות ישירות מהמסך של המטלה."],
        action: { label: "צפייה במועמדות", url },
        manageUrl,
      };
    }

    case "application_decided": {
      const task = str(data.task_name, "המטלה");
      const accepted = data.status === "accepted";
      return accepted
        ? {
            subject: `התקבלת למטלה "${task}"! 🎉`,
            preheader: "יש לך מטלה חדשה",
            heading: "התקבלת!",
            paragraphs: [`מזל טוב — התקבלת למטלה "${task}".`, "כדאי להיכנס לפרטי המטלה כדי לתאם את המועד והמקום."],
            action: { label: "לפרטי המטלה", url },
            manageUrl,
          }
        : {
            subject: `עדכון לגבי המועמדות שלך ל"${task}"`,
            preheader: "המועמדות לא התקבלה הפעם",
            heading: "עדכון על המועמדות שלך",
            paragraphs: [
              `המועמדות שלך למטלה "${task}" לא התקבלה הפעם.`,
              "יש עוד הרבה מטלות פתוחות — שווה להציץ.",
            ],
            action: { label: "למטלות פתוחות", url: `${base}/tasks` },
            manageUrl,
          };
    }

    case "message_received": {
      const sender = str(data.sender_name, "משתמש");
      const count = Number(data.unread_count) || 1;
      const plural = count > 1 ? `${count} הודעות חדשות` : "הודעה חדשה";
      return {
        subject: `${plural} מ${sender}`,
        preheader: "מחכה לך בצ׳אט",
        heading: `יש לך ${plural}`,
        paragraphs: [`${sender} שלח/ה לך ${plural} ב־BZB.`],
        action: { label: "פתיחת הצ׳אט", url },
        manageUrl,
      };
    }

    case "task_completed": {
      const task = str(data.task_name, "המטלה");
      const amount = shekels(data);
      return {
        subject: `המטלה "${task}" הושלמה ✅`,
        preheader: "סיכום המטלה",
        heading: "המטלה הושלמה",
        paragraphs: [`המטלה "${task}" סומנה כהושלמה.`],
        bullets: [`מטלה: ${task}`, ...(amount ? [`תשלום: ${amount}`] : [])],
        action: { label: "צפייה בסיכום", url },
        manageUrl,
      };
    }

    case "parent_child_accepted": {
      const child = str(data.child_name, "הילד/ה שלך");
      const task = str(data.task_name, "מטלה");
      const place = str(data.location);
      const schedule = when(data);
      return {
        subject: `${child} התקבל/ה למטלה "${task}"`,
        preheader: "עדכון על פעילות הילד/ה שלך",
        heading: "עדכון חשוב",
        paragraphs: [`${child} התקבל/ה לביצוע המטלה "${task}".`],
        bullets: [...(place ? [`מיקום: ${place}`] : []), ...(schedule ? [`מועד: ${schedule}`] : [])],
        action: { label: "למרכז ההורים", url },
        manageUrl,
      };
    }

    case "parent_digest": {
      const date = str(data.date);
      const cards = Array.isArray(data.cards)
        ? (data.cards as { title: string; lines: string[] }[])
        : [];
      return {
        subject: `הדוח היומי שלך מ־BZB — ${date}`,
        preheader: "סיכום הפעילות של הילדים שלך היום",
        heading: "הדוח היומי",
        paragraphs: ["הנה מה שקרה היום:"],
        cards,
        action: { label: "צפייה בדוח המלא", url },
        manageUrl,
      };
    }

    case "family_link_code": {
      const code = str(data.code);
      const child = str(data.child_name, "הילד/ה שלך");
      return {
        subject: "קוד הקישור המשפחתי שלך",
        preheader: "קוד לחיבור החשבון שלך לחשבון הילד/ה",
        heading: "קוד קישור משפחתי",
        paragraphs: [
          `${child} מבקש/ת לקשר את החשבון שלכם.`,
          "צריך להזין את הקוד הבא במרכז ההורים. הקוד תקף ל־10 דקות.",
        ],
        code,
        action: { label: "למרכז ההורים", url: `${base}/parent` },
        manageUrl,
      };
    }

    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      const headline = total === 1 ? "הודעה אחת חדשה" : `${total} הודעות חדשות`;
      const cards = Array.isArray(data.cards)
        ? (data.cards as { title: string; lines: string[]; url?: string }[])
        : [];
      return {
        subject: `${headline} שהגיעו בזמן השקט 🌙`,
        preheader: "סיכום ההודעות שהגיעו בזמן שהתראות היו מושתקות",
        heading: `בזמן השקט הגיעו ${headline}`,
        paragraphs: ["השתקנו את ההתראות בלילה כדי לא להעיר אותך. הנה מה שחיכה:"],
        cards,
        action: { label: "פתיחת הצ׳אט", url },
        manageUrl,
      };
    }

    case "task_cancelled": {
      const task = str(data.task_name, "המטלה");
      const canceller = str(data.canceller_name, "מפרסם המטלה");
      return {
        subject: `המטלה "${task}" בוטלה`,
        preheader: `${canceller} ביטל/ה את המטלה`,
        heading: "המטלה בוטלה",
        paragraphs: [
          `${canceller} ביטל/ה את המטלה "${task}".`,
          "אפשר לחפש מטלות חדשות בכל עת.",
        ],
        action: { label: "למטלות פתוחות", url: `${base}/tasks` },
        manageUrl,
      };
    }
  }
}

export function pushPayload(row: NotificationRow): PushPayload {
  const base = siteUrl();
  const data = row.data ?? {};
  const url = `${base}${row.link ?? "/"}`;

  switch (row.event_type) {
    case "application_received":
      return {
        title: "מועמדות חדשה 🐝",
        body: `${str(data.applicant_name, "מועמד/ת")} הגיש/ה מועמדות ל"${str(data.task_name, "המטלה שלך")}"`,
        url,
        tag: `application-${str(data.task_id)}`,
      };

    case "application_decided":
      return data.status === "accepted"
        ? {
            title: "התקבלת! 🎉",
            body: `התקבלת למטלה "${str(data.task_name, "המטלה")}"`,
            url,
            tag: `decision-${str(data.task_id)}`,
          }
        : {
            title: "עדכון על המועמדות",
            body: `המועמדות ל"${str(data.task_name, "המטלה")}" לא התקבלה הפעם`,
            url,
            tag: `decision-${str(data.task_id)}`,
          };

    case "message_received":
      return {
        title: str(data.sender_name, "הודעה חדשה"),
        body: "שלח/ה לך הודעה חדשה",
        url,
        // Same tag per conversation so a burst of messages collapses into one.
        tag: `chat-${str(data.conversation_id)}`,
      };

    case "task_completed":
      return {
        title: "המטלה הושלמה ✅",
        body: `"${str(data.task_name, "המטלה")}" סומנה כהושלמה`,
        url,
        tag: `completed-${str(data.task_id)}`,
      };

    case "parent_child_accepted":
      return {
        title: "עדכון על הילד/ה שלך",
        body: `${str(data.child_name, "הילד/ה")} התקבל/ה למטלה "${str(data.task_name, "מטלה")}"`,
        url,
        tag: `child-accepted-${str(data.task_id)}`,
      };

    case "parent_digest":
      return {
        title: "הדוח היומי שלך 🐝",
        body: str(data.summary, "סיכום הפעילות של הילדים שלך היום"),
        url,
        tag: `digest-${str(data.date)}`,
      };

    case "family_link_code":
      return {
        title: "קוד קישור משפחתי",
        body: "נשלח אליך קוד לחיבור החשבון",
        url,
        tag: "family-link",
      };

    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      return {
        title: total === 1 ? "הודעה אחת חדשה 🌙" : `היו ${total} הודעות חדשות 🌙`,
        body: "הגיעו בזמן שההתראות היו מושתקות",
        url,
        tag: `quiet-digest-${str(data.date)}`,
      };
    }

    case "task_cancelled":
      return {
        title: "המטלה בוטלה ❌",
        body: `"${str(data.task_name, "המטלה")}" בוטלה על ידי ${str(data.canceller_name, "המפרסם")}`,
        url,
        tag: `cancelled-${str(data.task_id)}`,
      };
  }
}

/**
 * Channel defaults for users who never touched the settings screen.
 * Operationally critical events default on; nice-to-know push defaults off.
 * Mirrored in src/lib/notificationCopy.ts for the settings UI.
 */
export const CHANNEL_DEFAULTS: Record<NotificationEvent, { email: boolean; push: boolean }> = {
  application_received: { email: true, push: true },
  application_decided: { email: true, push: true },
  message_received: { email: true, push: true },
  task_completed: { email: true, push: false },
  parent_child_accepted: { email: true, push: true },
  parent_digest: { email: true, push: true },
  family_link_code: { email: true, push: false },
  quiet_hours_digest: { email: true, push: true },
  task_cancelled: { email: true, push: true },
};
