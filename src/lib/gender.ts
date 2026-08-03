/**
 * Hebrew grammatical gender for everything the app says to or about a person.
 *
 * MIRRORED VERBATIM in supabase/functions/_shared/gender.ts — the client renders
 * the notification settings screen and the server renders email and push, and
 * both must inflect identically. architecture-invariants.test.ts fails if the
 * two copies drift.
 *
 * Two distinct people appear in most messages and they are resolved separately:
 *
 *   recipient — the person being addressed ("תקבל" / "תקבלי" / "תקבלו")
 *   subject   — a third party being described ("הגיש" / "הגישה" / "הגישו")
 *
 * A recipient the app cannot identify — a parent contact with no account — is
 * addressed in the plural, which is also what 'unspecified' produces.
 */

/** What is stored on the profile. */
export type Gender = "male" | "female" | "unspecified";

/** What the copy actually inflects on. */
export type Form = "male" | "female" | "plural";

/**
 * Anything that is not a stated male or female reads as plural: 'unspecified',
 * a missing profile, and a recipient with no account all land here.
 */
export const formFor = (gender?: Gender | string | null): Form =>
  gender === "male" ? "male" : gender === "female" ? "female" : "plural";

export type Inflection = { male: string; female: string; plural: string };

export const say = (form: Form, word: Inflection): string => word[form];

/**
 * Every inflected word the copy uses, in one place. Add here rather than
 * writing a slash form inline.
 *
 * Naming: SUBJECT_* is said about someone, RECIPIENT_* is said to them.
 */
export const SUBJECT = {
  /** הגיש מועמדות */
  submitted: { male: "הגיש", female: "הגישה", plural: "הגישו" },
  /** שלח לך הודעה */
  sent: { male: "שלח", female: "שלחה", plural: "שלחו" },
  /** ביקש שתקבלו עדכונים */
  asked: { male: "ביקש", female: "ביקשה", plural: "ביקשו" },
  /** מבקש לקשר את החשבון */
  asks: { male: "מבקש", female: "מבקשת", plural: "מבקשים" },
  /** התקבל למטלה */
  accepted: { male: "התקבל", female: "התקבלה", plural: "התקבלו" },
  /** מתקבל לביצוע מטלה */
  isAccepted: { male: "מתקבל", female: "מתקבלת", plural: "מתקבלים" },
  /** התחבר לאפליקציה */
  signedIn: { male: "התחבר", female: "התחברה", plural: "התחברו" },
  /** כשהוא מתחבר */
  signsIn: { male: "מתחבר", female: "מתחברת", plural: "מתחברים" },
  /** סיים את המטלה */
  finished: { male: "סיים", female: "סיימה", plural: "סיימו" },
  /** ביטל את המטלה */
  cancelled: { male: "ביטל", female: "ביטלה", plural: "ביטלו" },
  /** הוסיף אותך כהורה */
  added: { male: "הוסיף", female: "הוסיפה", plural: "הוסיפו" },
  /** מועמד/ת — used when no name is available */
  candidate: { male: "מועמד", female: "מועמדת", plural: "מועמד/ת" },
  /** הבן שלך / הבת שלך */
  yourChild: { male: "הבן שלך", female: "הבת שלך", plural: "הילד/ה שלך" },
  /** the child, without "your" */
  child: { male: "הבן", female: "הבת", plural: "הילד/ה" },
  /** הפעילות שלו */
  his: { male: "שלו", female: "שלה", plural: "שלהם" },
} as const satisfies Record<string, Inflection>;

export const RECIPIENT = {
  /** תקבל עדכון */
  willReceive: { male: "תקבל", female: "תקבלי", plural: "תקבלו" },
  /** החשבון שלך */
  yours: { male: "שלך", female: "שלך", plural: "שלכם" },
  /** נשלח לך */
  toYou: { male: "לך", female: "לך", plural: "לכם" },
  /** בקשו מהילד */
  ask: { male: "בקש", female: "בקשי", plural: "בקשו" },
  /** אפשר לאשר או לדחות */
  can: { male: "אתה יכול", female: "את יכולה", plural: "אתם יכולים" },
} as const satisfies Record<string, Inflection>;

/** Hebrew label for each stored value, for the pickers. */
export const GENDER_LABEL: Record<Gender, string> = {
  male: "זכר",
  female: "נקבה",
  unspecified: "מעדיפ/ה לא לציין",
};

export const GENDER_OPTIONS: Gender[] = ["male", "female", "unspecified"];
