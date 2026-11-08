// No imports: the Vite client reads this file through the @shared alias.

export const ISRAEL_TZ = "Asia/Jerusalem";

/** A non-blank string, trimmed, or the fallback. */
export const str = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

/** An ISO instant as a calendar date in Israel: 30.12.2026. */
export function dateHe(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: ISRAEL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}
