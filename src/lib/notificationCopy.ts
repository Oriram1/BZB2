/**
 * Client-side notification wording: the one-liners behind the bell and the
 * labels on the settings screen.
 *
 * Email and push copy lives in supabase/functions/_shared/notificationCopy.ts.
 * The split is deliberate — those are long-form messages, these are glanceable
 * lines — but the event list and channel defaults must stay in step.
 */
import { formFor, RECIPIENT, say, SUBJECT, type Form } from "@/lib/gender";

export type NotificationEvent =
  | "application_received"
  | "application_decided"
  | "message_received"
  | "task_completed"
  | "parent_child_accepted"
  | "parent_digest"
  | "family_link_code"
  | "quiet_hours_digest"
  | "task_cancelled"
  // Raised by a parent from the public view page; the child approves it.
  | "parent_contact_requested"
  // Subscription billing, raised by the billing functions.
  | "billing_renewal_reminder"
  | "billing_payment_succeeded"
  | "billing_payment_failed"
  | "billing_subscription_canceled"
  | "billing_subscription_ended"
  | "billing_refunded";

export type AppRole = "tasker" | "bee" | "parent";

export type NotificationRow = {
  id: string;
  event_type: NotificationEvent;
  data: Record<string, unknown>;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const dateHe = (value: unknown) => {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

/**
 * Single line shown in the bell dropdown.
 *
 * @param to How the reader is addressed. The bell only ever renders for the
 *   signed-in user, so callers pass that person's form.
 */
export function notificationLine(
  row: NotificationRow,
  to: Form = "plural",
): { title: string; body: string; emoji: string } {
  const data = row.data ?? {};
  /** The third party this line is about, where there is one. */
  const about = (key: string) => formFor(data[key] as string | undefined);

  switch (row.event_type) {
    case "application_received":
      return {
        emoji: "🐝",
        title: "מועמדות חדשה",
        body: `${text(data.applicant_name, say(about("applicant_gender"), SUBJECT.candidate))} ${say(about("applicant_gender"), SUBJECT.submitted)} מועמדות ל"${text(data.task_name, `המטלה ${say(to, RECIPIENT.yours)}`)}"`,
      };

    case "application_decided":
      return data.status === "accepted"
        ? {
            emoji: "🎉",
            title: "התקבלת!",
            body: `התקבלת למטלה "${text(data.task_name, "המטלה")}"`,
          }
        : {
            emoji: "💬",
            title: "עדכון על המועמדות",
            body: `המועמדות ל"${text(data.task_name, "המטלה")}" לא התקבלה הפעם`,
          };

    case "message_received":
      return {
        emoji: "✉️",
        title: "הודעה חדשה",
        body: `${text(data.sender_name, "משתמש")} ${say(about("sender_gender"), SUBJECT.sent)} ${say(to, RECIPIENT.toYou)}: ${text(data.message_content, "הודעה חדשה")}`,
      };

    case "task_completed":
      return {
        emoji: "✅",
        title: "המטלה הושלמה",
        body: `"${text(data.task_name, "המטלה")}" סומנה כהושלמה`,
      };

    case "parent_child_accepted":
      return {
        emoji: "👋",
        title: `עדכון על ${say(about("child_gender"), SUBJECT.child)}`,
        body: `${text(data.child_name, say(about("child_gender"), SUBJECT.child))} ${say(about("child_gender"), SUBJECT.accepted)} למטלה "${text(data.task_name, "מטלה")}"`,
      };

    case "parent_digest":
      return {
        emoji: "📊",
        title: "הדוח היומי",
        body: text(data.summary, "סיכום הפעילות של הילדים שלך"),
      };

    case "family_link_code":
      return { emoji: "🔗", title: "קוד קישור משפחתי", body: "נשלח קוד לחיבור החשבון" };

    case "quiet_hours_digest": {
      const total = Number(data.total) || 0;
      return {
        emoji: "🌙",
        title: total === 1 ? "הודעה אחת חדשה" : `${total} הודעות חדשות`,
        body: "הגיעו בזמן שההתראות היו מושתקות",
      };
    }

    case "parent_contact_requested":
      return {
        emoji: "👀",
        title: "בקשה לקבל עדכונים עליך",
        // Passive on purpose. The requester is a stranger who typed an address,
        // so there is no gender to inflect on and no slash form to fall back to.
        body: `התקבלה בקשה מהכתובת ${text(data.email, "שהוזנה")} לקבל עדכונים על הפעילות ${say(to, RECIPIENT.yours)}`,
      };

    case "task_cancelled":
      return {
        emoji: "❌",
        title: "מטלה בוטלה",
        body: `"${text(data.task_name, "המטלה")}" בוטלה על ידי ${text(data.canceller_name, "המפרסם")}`,
      };

    case "billing_renewal_reminder":
      return {
        emoji: "🔔",
        title: "המנוי מתחדש בקרוב",
        body: `${text(data.plan_name, "המנוי")} יתחדש ב־${dateHe(data.renews_at) || "בקרוב"}`,
      };

    case "billing_payment_succeeded":
      return {
        emoji: "✅",
        title: "התשלום התקבל",
        body: `מנוי ${text(data.plan_name, "BZB")} בתוקף עד ${dateHe(data.period_end) || "סוף התקופה"}`,
      };

    case "billing_payment_failed":
      return {
        emoji: "⚠️",
        title: "החיוב נכשל",
        body: "לא הצלחנו לחייב את הכרטיס. אפשר לעדכן ולשלם מההגדרות",
      };

    case "billing_subscription_canceled":
      return {
        emoji: "🛑",
        title: "המנוי בוטל",
        body: `לא יתחדש. פעיל עד ${dateHe(data.ends_at) || "סוף התקופה"}`,
      };

    case "billing_subscription_ended":
      return {
        emoji: "🐝",
        title: "המנוי הסתיים",
        body: data.reason === "payment_failed" ? "לא הצלחנו לגבות תשלום, חזרתם למסלול החינמי" : "חזרתם למסלול החינמי",
      };

    case "billing_refunded":
      return { emoji: "💸", title: "בוצע זיכוי", body: "הסכום זוכה לכרטיס והמנוי הסתיים" };

    default:
      return { emoji: "🔔", title: "התראה", body: "" };
  }
}

/** Mirrors CHANNEL_DEFAULTS in the edge-function copy module. */
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
  parent_contact_requested: { email: true, push: true },
  billing_renewal_reminder: { email: true, push: true },
  billing_payment_succeeded: { email: true, push: true },
  billing_payment_failed: { email: true, push: true },
  billing_subscription_canceled: { email: true, push: true },
  billing_subscription_ended: { email: true, push: true },
  billing_refunded: { email: true, push: true },
};

/**
 * Rows on the settings screen. `family_link_code` is missing on purpose: it is
 * only ever sent because someone explicitly asked for it, so a toggle would be
 * a switch that turns off a button the user just pressed.
 */
export const SETTINGS_ROWS: {
  event: NotificationEvent;
  label: string;
  description: string;
  roles: AppRole[];
}[] = [
  {
    event: "application_received",
    label: "מועמדות חדשה למטלה שלי",
    description: "כשמישהו מגיש מועמדות לאחת המטלות שפרסמתם",
    roles: ["tasker"],
  },
  {
    event: "application_decided",
    label: "תשובה על מועמדות שהגשתי",
    description: "כשבעל המטלה מאשר או דוחה את המועמדות שלכם",
    roles: ["bee"],
  },
  {
    event: "message_received",
    label: "הודעה חדשה בצ׳אט",
    description: "מיילים נשלחים מקובצים, ולא על כל הודעה בנפרד",
    roles: ["tasker", "bee"],
  },
  {
    event: "task_completed",
    label: "מטלה הושלמה",
    description: "אישור וסיכום כשמטלה מסומנת כבוצעה",
    roles: ["tasker", "bee"],
  },
  {
    event: "parent_child_accepted",
    label: "הילד התקבל למטלה",
    description: "התראה מיידית כשהילד מתקבל לביצוע מטלה",
    roles: ["parent"],
  },
  {
    event: "parent_digest",
    label: "דוח יומי",
    description: "סיכום יומי של פעילות הילדים שלכם",
    roles: ["parent"],
  },
  {
    event: "task_cancelled",
    label: "מטלה שהתקבלתי אליה בוטלה",
    description: "כשבעל המטלה מבטל מטלה שכבר התקבלתם אליה",
    roles: ["bee"],
  },
];

export function rowsForRoles(roles: string[]) {
  return SETTINGS_ROWS.filter((row) => row.roles.some((role) => roles.includes(role)));
}
