// No Deno or remote imports: vitest loads this file through quietHours.ts.
import { ISRAEL_TZ } from "./formatHe.ts";

export { ISRAEL_TZ };

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Calendar date (YYYY-MM-DD) and hour (0-23) of an instant, as read on a clock in Israel. */
export function israelParts(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ISRAEL_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  // en-CA renders midnight as "24" rather than "00".
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

export const israelHour = (now: Date) => israelParts(now).hour;
export const israelDate = (now: Date) => israelParts(now).date;

/** Israel's UTC offset at an instant, as the "+03:00" suffix a Date constructor accepts. */
export function israelOffset(at: Date) {
  const label =
    new Intl.DateTimeFormat("en-US", { timeZone: ISRAEL_TZ, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+03:00";
  return label.replace("GMT", "") || "+03:00";
}

/** The UTC instant at which an Israeli calendar day (YYYY-MM-DD) begins. */
export function dayStart(date: string) {
  return new Date(`${date}T00:00:00${israelOffset(new Date(`${date}T12:00:00Z`))}`);
}
