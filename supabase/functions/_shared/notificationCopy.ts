/**
 * Wording for every notification, in one place.
 *
 * The database stores `event_type` + `data` only, so this module is the single
 * source of truth for what a user actually reads — in email and in push alike.
 */
import { siteUrl, type EmailContent } from "./email.ts";
import { formFor, RECIPIENT, say, SUBJECT, type Form } from "./gender.ts";

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
  // Addressed to a parent who has no account, so it is mailed directly and
  // never stored in public.notifications (which is keyed by user_id).
  | "parent_contact_added"
  | "child_signed_in";

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

/**
 * @param to How the reader is addressed. Callers that know who the recipient is
 *   pass their form; a parent contact with no account is left to default to the
 *   plural, which is also what someone who declined to say gets.
 */
export function emailContent(row: NotificationRow, to: Form = "plural"): EmailContent {
  const base = siteUrl();
  const data = row.data ?? {};
  const url = `${base}${row.link ?? "/"}`;
  const manageUrl = `${base}/settings`;
  /** The third party this message is about, where there is one. */
  const about = (key: string) => formFor(data[key] as string | undefined);

  switch (row.event_type) {
    case "application_received": {
      const who = about("applicant_gender");
      const name = str(data.applicant_name, say(who, SUBJECT.candidate));
      const task = str(data.task_name, `המטלה ${say(to, RECIPIENT.yours)}`);
      const submitted = say(who, SUBJECT.submitted);
      return {
        subject: `${name} ${submitted} מועמדות ל"${task}" 🐝`,
        preheader: `מועמדות חדשה מחכה לתשובה ${say(to, RECIPIENT.yours)}`,
        heading: `יש ${say(to, RECIPIENT.toYou)} מועמדות חדשה`,
        paragraphs: [`${name} ${submitted} מועמדות למטלה "${task}".`, "אפשר לאשר או לדחות ישירות מהמסך של המטלה."],
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
            preheader: `יש ${say(to, RECIPIENT.toYou)} מטלה חדשה`,
            heading: "התקבלת!",
            paragraphs: [`מזל טוב — התקבלת למטלה "${task}".`, "כדאי להיכנס לפרטי המטלה כדי לתאם את המועד והמקום."],
            action: { label: "לפרטי המטלה", url },
            manageUrl,
          }
        : {
            subject: `עדכון לגבי המועמדות ${say(to, RECIPIENT.yours)} ל"${task}"`,
            preheader: "המועמדות לא התקבלה הפעם",
            heading: `עדכון על המועמדות ${say(to, RECIPIENT.yours)}`,
            paragraphs: [
              `המועמדות ${say(to, RECIPIENT.yours)} למטלה "${task}" לא התקבלה הפעם.`,
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
      const toYou = say(to, RECIPIENT.toYou);
      return {
        subject: `${plural} מ${sender}`,
        preheader: `מחכה ${toYou} בצ׳אט`,
        heading: `יש ${toYou} ${plural}`,
        paragraphs: [`${sender} ${say(about("sender_gender"), SUBJECT.sent)} ${toYou} הודעה: "${str(data.message_content, "הודעה חדשה")}"`],
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
      const kid = about("child_gender");
      const child = str(data.child_name, say(kid, SUBJECT.yourChild));
      const task = str(data.task_name, "מטלה");
      const place = str(data.location);
      const schedule = when(data);
      const accepted = say(kid, SUBJECT.accepted);
      return {
        subject: `${child} ${accepted} למטלה "${task}"`,
        preheader: `עדכון על פעילות ${say(kid, SUBJECT.yourChild)}`,
        heading: "עדכון חשוב",
        paragraphs: [`${child} ${accepted} לביצוע המטלה "${task}".`],
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
        subject: `הדוח היומי ${say(to, RECIPIENT.yours)} מ־BZB — ${date}`,
        preheader: `סיכום הפעילות של הילדים ${say(to, RECIPIENT.yours)} היום`,
        heading: "הדוח היומי",
        paragraphs: ["הנה מה שקרה היום:"],
        cards,
        action: { label: "צפייה בדוח המלא", url },
        manageUrl,
      };
    }

    case "family_link_code": {
      const code = str(data.code);
      const kid = about("child_gender");
      const child = str(data.child_name, say(kid, SUBJECT.yourChild));
      return {
        subject: `קוד הקישור המשפחתי ${say(to, RECIPIENT.yours)}`,
        preheader: `קוד לחיבור החשבון ${say(to, RECIPIENT.yours)} לחשבון ${say(kid, SUBJECT.child)}`,
        heading: "קוד קישור משפחתי",
        paragraphs: [
          `${child} ${say(kid, SUBJECT.asks)} לקשר את החשבון שלכם.`,
          "צריך להזין את הקוד הבא במרכז ההורים. הקוד תקף ל־10 דקות.",
        ],
        code,
        action: { label: "למרכז ההורים", url: `${base}/parent` },
        manageUrl,
      };
    }

    case "parent_contact_added": {
      const kid = about("child_gender");
      const child = str(data.child_name, say(kid, SUBJECT.yourChild));
      return {
        subject: `${child} ${say(kid, SUBJECT.added)} אתכם כהורה ב־Busy Bee 🐝`,
        preheader: `מעכשיו ${say(to, RECIPIENT.willReceive)} עדכון כש${say(kid, SUBJECT.child)} ${say(kid, SUBJECT.signsIn)}`,
        heading: "אתם מחוברים",
        paragraphs: [
          `${child} ${say(kid, SUBJECT.asked)} ש${say(to, RECIPIENT.willReceive)} עדכונים על הפעילות ${say(kid, SUBJECT.his)} ב־Busy Bee.`,
          "אין צורך להירשם או לפתוח חשבון — העדכונים יגיעו למייל הזה.",
          `אם זו טעות, ${say(to, RECIPIENT.ask)} מ${say(kid, SUBJECT.child)} להסיר את הכתובת דרך הפרופיל ${say(kid, SUBJECT.his)}.`,
        ],
        ...(str(data.view_token) ? { action: { label: "צפייה בסטטוס המטלות", url } } : {}),
        manageUrl,
      };
    }

    case "child_signed_in": {
      const kid = about("child_gender");
      const child = str(data.child_name, say(kid, SUBJECT.yourChild));
      const at = str(data.signed_in_at);
      const signedIn = say(kid, SUBJECT.signedIn);
      return {
        subject: `${child} ${signedIn} ל־Busy Bee`,
        preheader: "עדכון התחברות",
        heading: "עדכון התחברות",
        paragraphs: [
          at ? `${child} ${signedIn} לאפליקציה ב־${at}.` : `${child} ${signedIn} לאפליקציה.`,
          "זהו עדכון בלבד — לא נדרשת מכם שום פעולה.",
          "כדי למנוע הצפה, נשלח על כך לכל היותר עדכון אחד ביום.",
        ],
        ...(str(data.view_token) ? { action: { label: "צפייה בסטטוס המטלות", url } } : {}),
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
      const cancelled = say(about("canceller_gender"), SUBJECT.cancelled);
      return {
        subject: `המטלה "${task}" בוטלה`,
        preheader: `${canceller} ${cancelled} את המטלה`,
        heading: "המטלה בוטלה",
        paragraphs: [
          `${canceller} ${cancelled} את המטלה "${task}".`,
          "אפשר לחפש מטלות חדשות בכל עת.",
        ],
        action: { label: "למטלות פתוחות", url: `${base}/tasks` },
        manageUrl,
      };
    }
  }
}

export function pushPayload(row: NotificationRow, to: Form = "plural"): PushPayload {
  const base = siteUrl();
  const data = row.data ?? {};
  const url = `${base}${row.link ?? "/"}`;
  const about = (key: string) => formFor(data[key] as string | undefined);

  switch (row.event_type) {
    case "application_received":
      return {
        title: "מועמדות חדשה 🐝",
        body: `${str(data.applicant_name, say(about("applicant_gender"), SUBJECT.candidate))} ${say(about("applicant_gender"), SUBJECT.submitted)} מועמדות ל"${str(data.task_name, `המטלה ${say(to, RECIPIENT.yours)}`)}"`,
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
        body: `${say(about("sender_gender"), SUBJECT.sent)} ${say(to, RECIPIENT.toYou)}: ${str(data.message_content, "הודעה חדשה")}`,
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
        title: `עדכון על ${say(about("child_gender"), SUBJECT.yourChild)}`,
        body: `${str(data.child_name, say(about("child_gender"), SUBJECT.child))} ${say(about("child_gender"), SUBJECT.accepted)} למטלה "${str(data.task_name, "מטלה")}"`,
        url,
        tag: `child-accepted-${str(data.task_id)}`,
      };

    case "parent_digest":
      return {
        title: `הדוח היומי ${say(to, RECIPIENT.yours)} 🐝`,
        body: str(data.summary, `סיכום הפעילות של הילדים ${say(to, RECIPIENT.yours)} היום`),
        url,
        tag: `digest-${str(data.date)}`,
      };

    case "family_link_code":
      return {
        title: "קוד קישור משפחתי",
        body: `נשלח ${say(to, RECIPIENT.toYou)} קוד לחיבור החשבון`,
        url,
        tag: "family-link",
      };

    // Both of these are addressed to a parent with no account, so there is no
    // device to push to. The cases exist to keep this switch exhaustive.
    case "parent_contact_added":
      return {
        title: "אתם מחוברים",
        body: `${str(data.child_name, say(about("child_gender"), SUBJECT.yourChild))} ${say(about("child_gender"), SUBJECT.added)} אתכם כהורה`,
        url,
        tag: "parent-contact-added",
      };

    case "child_signed_in":
      return {
        title: "עדכון התחברות",
        body: `${str(data.child_name, say(about("child_gender"), SUBJECT.yourChild))} ${say(about("child_gender"), SUBJECT.signedIn)} ל־Busy Bee`,
        url,
        tag: "child-signed-in",
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
  // Sent to an address, not to an account, so the per-user settings screen
  // never reaches these. The child removes the contact to stop them.
  parent_contact_added: { email: true, push: false },
  child_signed_in: { email: true, push: false },
};
