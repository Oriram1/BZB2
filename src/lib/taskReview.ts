import { SHORT_DESC_MAX } from "@shared/taskLimits.ts";
/** What the task-assistant function returns; null means "not said". */
export interface AssistantFields {
  category: string | null;
  taskName: string | null;
  shortDesc: string | null;
  fullDesc: string | null;
  payment: number | null;
  paymentType: "task" | "hour" | null;
  workers: number | null;
  location: string | null;
  date: string | null;
  time: string | null;
  duration: number | null;
}

/** The create-task form as CreateTask keeps it: every value is the string an input holds. */
export interface ReviewForm {
  category: string; taskName: string; shortDesc: string; fullDesc: string;
  payment: string; paymentType: string; workers: string;
  location: string; date: string; time: string; duration: string; durationUnit: string; expiry: string;
  notes: string;
}
export type ReviewField = keyof ReviewForm;

export { SHORT_DESC_MAX };

export const reviewLabels: Partial<Record<ReviewField, string>> = {
  category: "קטגוריה", taskName: "כותרת", shortDesc: "תיאור קצר", fullDesc: "תיאור מפורט",
  payment: "תשלום", paymentType: "סוג תשלום", workers: "עובדים", location: "כתובת",
  date: "תאריך", time: "שעה", duration: "משך משוער", expiry: "תוקף המודעה", notes: "הערות",
};

export const todayIso = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

/** The same rules the wizard steps enforce; null means the value may be saved. */
export function fieldError(field: ReviewField, value: string): string | null {
  const trimmed = value.trim();
  const required: ReviewField[] = ["category", "taskName", "shortDesc", "payment", "location", "date", "time"];
  if (required.includes(field) && !trimmed) return "שדה חובה";
  if (field === "shortDesc" && trimmed.length > SHORT_DESC_MAX) return `עד ${SHORT_DESC_MAX} תווים`;
  if (field === "payment" && !(Number(trimmed) > 0)) return "סכום גדול מ-0";
  if (field === "workers" && !(Number.isInteger(Number(trimmed)) && Number(trimmed) >= 1)) return "לפחות עובד אחד";
  if (field === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || trimmed < todayIso())) return "תאריך מהיום והלאה";
  if (field === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return "שעה בפורמט HH:MM";
  if (field === "duration" && trimmed && !(Number(trimmed) >= 1 && Number(trimmed) <= 30)) return "בין 1 ל-30 ימים";
  if (field === "expiry" && !(Number(trimmed) >= 1 && Number(trimmed) <= 30)) return "בין 1 ל-30 ימים";
  return null;
}

/** The current task in plain Hebrew, so the assistant can apply a change on top of it. */
export function describeForm(form: ReviewForm) {
  const lines = [
    `קטגוריה: ${form.category || "לא נבחרה"}`,
    `כותרת: ${form.taskName}`,
    `תיאור קצר: ${form.shortDesc}`,
    form.fullDesc && `תיאור מפורט: ${form.fullDesc}`,
    `תשלום: ${form.payment} ש״ח ${form.paymentType === "hour" ? "לשעה" : "למשימה"}`,
    `עובדים: ${form.workers}`,
    `כתובת: ${form.location}`,
    `תאריך: ${form.date}`,
    `שעה: ${form.time}`,
    form.duration && `משך: ${form.duration} ימים`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Assistant output as form strings; null means "unchanged", never "clear it". */
export function assistantChanges(fields: AssistantFields, form: ReviewForm): Partial<ReviewForm> {
  const next: Partial<ReviewForm> = {};
  const set = (key: ReviewField, value: string | number | null) => {
    if (value === null || value === undefined) return;
    const text = String(value);
    if (text !== form[key]) next[key] = text;
  };
  (["category", "taskName", "shortDesc", "fullDesc", "paymentType", "location", "date", "time"] as const)
    .forEach((key) => set(key, fields[key]));
  set("payment", fields.payment);
  set("workers", fields.workers);
  set("duration", fields.duration);
  return next;
}
