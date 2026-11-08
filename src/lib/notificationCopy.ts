import { dateHe, str } from "@shared/formatHe.ts";
/**
 * Client-side notification wording: the one-liners behind the bell and the
 * labels on the settings screen.
 *
 * Email and push copy lives in supabase/functions/_shared/notificationCopy.ts:
 * those are long-form messages, these are glanceable lines. The event list and
 * channel defaults come from the shared notificationEvents.ts.
 */
import type { NotificationEvent, NotificationRow as SharedNotificationRow } from "@shared/notificationEvents.ts";
import { formFor, RECIPIENT, say, SUBJECT, type Form } from "@shared/gender.ts";
import type { AppRole } from "@/lib/routes";

export type NotificationRow = SharedNotificationRow & {
  read_at: string | null;
  created_at: string;
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
        body: `${str(data.applicant_name, say(about("applicant_gender"), SUBJECT.candidate))} ${say(about("applicant_gender"), SUBJECT.submitted)} מועמדות ל"${str(data.task_name, `המטלה ${say(to, RECIPIENT.yours)}`)}"`,
      };

    case "application_decided":
      return data.status === "accepted"
        ? {
            emoji: "🎉",
            title: "התקבלת!",
            body: `התקבלת למטלה "${str(data.task_name, "המטלה")}"`,
          }
        : {
            emoji: "💬",
            title: "עדכון על המועמדות",
            body: `המועמדות ל"${str(data.task_name, "המטלה")}" לא התקבלה הפעם`,
          };

    case "message_received":
      return {
        emoji: "✉️",
        title: "הודעה חדשה",
        body: `${str(data.sender_name, "משתמש")} ${say(about("sender_gender"), SUBJECT.sent)} ${say(to, RECIPIENT.toYou)}: ${str(data.message_content, "הודעה חדשה")}`,
      };

    case "review_report_resolved":
      return { emoji: "📋", title: "עדכון על דיווח", body: "הבדיקה הסתיימה. אפשר לראות את ההחלטה בפרופיל" };
    case "review_appeal_resolved":
      return { emoji: "📋", title: "עדכון על ערעור", body: "הערעור על הביקורת נבדק. אפשר לראות את ההחלטה בפרופיל" };
    case "review_reminder":
      return { emoji: "⭐", title: data.kind === "last" ? "הזמן לדרג עומד להסתיים" : "איך היה לעבוד יחד?", body: `דירוג קצר על "${str(data.task_name, "המטלה")}" יעזור לאחרים לבחור בביטחון` };
    case "review_rejected":
      return { emoji: "📝", title: "עדכון על הביקורת שכתבתם", body: data.removed ? "ביקורת שפרסמתם הוסרה לאחר בדיקה" : "הביקורת לא אושרה. אפשר לבדוק את הסיבה בפרופיל" };
    case "review_response_approved":
      return { emoji: "💬", title: "תגובה לביקורת שכתבתם", body: "התקבלה תגובה לביקורת שלכם" };
    case "review_approved":
      return { emoji: "⭐", title: "קיבלתם דירוג חדש", body: `הדירוג על "${str(data.task_name, "המטלה")}" אושר ומופיע בפרופיל שלכם` };

    case "task_completed":
      return {
        emoji: "✅",
        title: "המטלה הושלמה",
        body: `"${str(data.task_name, "המטלה")}" סומנה כהושלמה`,
      };

    case "parent_child_accepted":
      return {
        emoji: "👋",
        title: `עדכון על ${say(about("child_gender"), SUBJECT.child)}`,
        body: `${str(data.child_name, say(about("child_gender"), SUBJECT.child))} ${say(about("child_gender"), SUBJECT.accepted)} למטלה "${str(data.task_name, "מטלה")}"`,
      };

    case "parent_digest":
      return {
        emoji: "📊",
        title: "הדוח היומי",
        body: str(data.summary, "סיכום הפעילות של הילדים שלך"),
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
        body: `התקבלה בקשה מהכתובת ${str(data.email, "שהוזנה")} לקבל עדכונים על הפעילות ${say(to, RECIPIENT.yours)}`,
      };

    case "task_cancelled":
      return {
        emoji: "❌",
        title: "מטלה בוטלה",
        body: `"${str(data.task_name, "המטלה")}" בוטלה על ידי ${str(data.canceller_name, "המפרסם")}`,
      };

    case "billing_renewal_reminder":
      return {
        emoji: "🔔",
        title: "המנוי מתחדש בקרוב",
        body: `${str(data.plan_name, "המנוי")} יתחדש ב־${dateHe(data.renews_at) || "בקרוב"}`,
      };

    case "billing_payment_succeeded":
      return {
        emoji: "✅",
        title: "התשלום התקבל",
        body: `מנוי ${str(data.plan_name, "BZB")} בתוקף עד ${dateHe(data.period_end) || "סוף התקופה"}`,
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

    case "task_approved":
      return { emoji: "✅", title: "המטלה פורסמה", body: `"${str(data.task_name, "המטלה")}" אושרה וגלויה לעוזרים` };

    case "task_rejected":
      return { emoji: "🚫", title: "המטלה לא אושרה", body: `"${str(data.task_name, "המטלה")}" לא אושרה. לא חויבתם` };

    case "task_payment_failed":
      if (data.reason === "manual_payment_required") return { emoji: "💳", title: "המטלה אושרה - נדרש תשלום", body: "הכרטיס השמור לא חויב. אפשר לבחור אמצעי תשלום ולהשלים את הפרסום" };
      return { emoji: "⚠️", title: "החיוב נדחה", body: `"${str(data.task_name, "המטלה")}" ממתינה לתשלום. אפשר לנסות כרטיס אחר` };

    case "task_payment_reminder":
      return { emoji: "⏳", title: "המטלה ממתינה לתשלום", body: `"${str(data.task_name, "המטלה")}" תחזור לטיוטה בעוד כמה ימים` };

    case "task_returned_to_draft":
      return { emoji: "📝", title: "המטלה חזרה לטיוטה", body: `"${str(data.task_name, "המטלה")}" לא שולמה, ולא חויבתם` };

    case "tasks_hidden":
      return { emoji: "🙈", title: "משימות הוסתרו", body: "המנוי הסתיים. חידוש יחזיר אותן מיד" };

    case "billing_plan_changed":
      return {
        emoji: "🔁",
        title: data.kind === "card_updated" ? "הכרטיס הוחלף בהצלחה" : data.kind === "trial_started" ? "החודש החינם התחיל" : "המסלול עודכן",
        body: "פרטים בדף המנוי",
      };

    default:
      return { emoji: "🔔", title: "התראה", body: "" };
  }
}

/**
 * Rows on the settings screen. `family_link_code` is missing on purpose: it is
 * only ever sent because someone explicitly asked for it, so a toggle would be
 * a switch that turns off a button the user just pressed.
 */
const SETTINGS_ROWS: {
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
    description: "מייל על ההודעה הראשונה, ועד מייל אחד לשעה בכל שיחה",
    roles: ["tasker", "bee"],
  },
  { event: "review_report_resolved", label: "עדכון על דיווח ביקורת", description: "כשהתקבלה החלטה על דיווח שלכם", roles: ["tasker", "bee"] },
  { event: "review_appeal_resolved", label: "עדכון על ערעור ביקורת", description: "כשהתקבלה החלטה על הערעור שלכם", roles: ["tasker", "bee"] },
  {
    event: "review_rejected", label: "עדכון על ביקורת שכתבתי", description: "כשהביקורת לא אושרה או הוסרה לאחר בדיקה", roles: ["tasker", "bee"],
  },
  {
    event: "review_response_approved", label: "תגובה לביקורת שכתבתי", description: "כשמאושרת תגובה לביקורת שלכם", roles: ["tasker", "bee"],
  },
  { event: "review_reminder", label: "תזכורת לדרג", description: "תזכורת אחרי השלמת מטלה, ועוד אחת לפני שזמן הדירוג מסתיים", roles: ["tasker", "bee"] },
  {
    event: "review_approved",
    label: "דירוג חדש שהתקבל",
    description: "כשהדירוג עליכם אושר ומופיע בפרופיל",
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
