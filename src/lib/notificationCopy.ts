/**
 * Client-side notification wording: the one-liners behind the bell and the
 * labels on the settings screen.
 *
 * Email and push copy lives in supabase/functions/_shared/notificationCopy.ts.
 * The split is deliberate — those are long-form messages, these are glanceable
 * lines — but the event list and channel defaults must stay in step.
 */

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

/** Single line shown in the bell dropdown. */
export function notificationLine(row: NotificationRow): { title: string; body: string; emoji: string } {
  const data = row.data ?? {};

  switch (row.event_type) {
    case "application_received":
      return {
        emoji: "🐝",
        title: "מועמדות חדשה",
        body: `${text(data.applicant_name, "מועמד/ת")} הגיש/ה מועמדות ל"${text(data.task_name, "המטלה שלך")}"`,
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
        body: `${text(data.sender_name, "משתמש")} שלח/ה לך הודעה`,
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
        title: "עדכון על הילד/ה",
        body: `${text(data.child_name, "הילד/ה")} התקבל/ה למטלה "${text(data.task_name, "מטלה")}"`,
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

    case "task_cancelled":
      return {
        emoji: "❌",
        title: "מטלה בוטלה",
        body: `"${text(data.task_name, "המטלה")}" בוטלה על ידי ${text(data.canceller_name, "המפרסם")}`,
      };

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
    label: "הילד/ה התקבל/ה למטלה",
    description: "התראה מיידית כשהילד/ה מתקבל/ת לביצוע מטלה",
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
