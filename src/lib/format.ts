/**
 * Israeli formatting helpers.
 * Dates are dd/mm/yyyy, times are HH:mm (no seconds), money is ₪ with
 * thousands separators. Everything is rendered through Intl with the he-IL
 * locale and the Asia/Jerusalem time zone rather than hand-built strings.
 */

const TIME_ZONE = "Asia/Jerusalem";

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const longDateFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

const currencyFormatterWithAgorot = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Placeholder shown instead of an empty or unparsable value. */
export const EMPTY = "לא צוין";

/** "2026-04-16" -> "16/04/2026". Returns EMPTY for missing/invalid input. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return dateFormatter.format(date);
}

/** Combines task date/time as "dd/mm/yyyy hh:mm". */
export function formatDateTime(
  date?: string | Date | null,
  time?: string | Date | null,
): string {
  const formattedDate = formatDate(date);
  const formattedTime = time ? formatTime(time) : EMPTY;
  if (formattedDate === EMPTY) return formattedTime;
  if (formattedTime === EMPTY) return formattedDate;
  return `${formattedDate} ${formattedTime}`;
}

/** "2026-04-16" -> "יום חמישי, 16 באפריל 2026". For detail screens. */
export function formatLongDate(value?: string | Date | null): string {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return longDateFormatter.format(date);
}

/** "14:00:00" -> "14:00". Accepts a time string or a Date. */
export function formatTime(value?: string | Date | null): string {
  if (!value) return EMPTY;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return EMPTY;
    return new Intl.DateTimeFormat("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: TIME_ZONE,
    }).format(value);
  }
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return EMPTY;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** 50 -> "₪50". */
export function formatCurrency(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return EMPTY;
  // Whole shekels stay whole; an amount like 0.10 must not round down to 0.
  return (Number.isInteger(amount) ? currencyFormatter : currencyFormatterWithAgorot).format(amount);
}

/** 0.5 -> "חצי שעה", 1 -> "שעה", 2 -> "שעתיים", 0.38 -> "23 דקות". */
export function formatDuration(hours?: number | null): string {
  if (!hours || Number.isNaN(hours) || hours <= 0) return EMPTY;
  if (Math.abs(hours - 0.5) < 0.01) return "חצי שעה";
  if (Math.abs(hours - 1) < 0.01) return "שעה";
  if (Math.abs(hours - 1.5) < 0.01) return "שעה וחצי";
  if (Math.abs(hours - 2) < 0.01) return "שעתיים";
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} דקות`;
  }
  const rounded = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `${rounded} שעות`;
}

/** Great-circle distance in kilometres between two lat/lng pairs. */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "לפני 5 דקות" / "אתמול". For notification feeds, where exact times add noise. */
export function formatRelativeTime(value?: string | Date | null): string {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "עכשיו";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "לפני דקה" : `לפני ${minutes} דקות`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`;

  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;

  return formatDate(date);
}

/** 2.3456 -> "2.3". Distances under 1 km are shown in metres. */
export function formatDistance(km?: number | null): string {
  if (km === null || km === undefined || Number.isNaN(km)) return EMPTY;
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  return `${km.toFixed(1)} ק״מ`;
}

/**
 * Normalises an Israeli phone number for storage: strips spaces, hyphens and
 * parentheses, and converts +972 / 972 prefixes to the local 0 form.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+972")) return "0" + digits.slice(4);
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  // People routinely drop the leading zero ("502032767"). Nine digits starting
  // with 5 can only be an Israeli mobile, so complete it instead of rejecting.
  if (/^5\d{8}$/.test(digits)) return "0" + digits;
  return digits;
}

/** Israeli mobile (05X, 10 digits) or landline (0X, 9 digits). */
export function isValidPhone(input: string): boolean {
  const phone = normalizePhone(input);
  return /^05\d{8}$/.test(phone) || /^0[2-489]\d{7}$/.test(phone);
}

/** The oldest age we accept: past the oldest person ever recorded, so only typos are caught. */
export const MAX_AGE = 120;

/**
 * Whether a typed age is out of range. "above" can be said as soon as it is
 * typed (no extra digit can fix 345); "below" is judged by the caller, because
 * "1" may still become "18".
 */
export function ageIssue(raw: string, minAge: number): "below" | "above" | null {
  const age = parseInt(raw, 10);
  if (Number.isNaN(age)) return null;
  if (age > MAX_AGE) return "above";
  if (age < minAge) return "below";
  return null;
}

/**
 * What is wrong with a phone number while it is still being typed.
 *   null          empty, or already a valid number
 *   "incomplete"  the digits so far could still become a valid number
 *   "invalid"     no continuation can make it valid (letters, a wrong prefix,
 *                 too many digits), so it is worth saying so right away
 */
export function phoneIssue(input: string): "incomplete" | "invalid" | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isValidPhone(raw)) return null;

  const compact = raw.replace(/[\s\-()]/g, "");
  // "+", "+9", "+97", "972": the start of an international prefix.
  if (compact === "+" || /^\+?9(7(2)?)?$/.test(compact)) return "incomplete";
  if (!/^\+?\d+$/.test(compact)) return "invalid";

  const phone = normalizePhone(compact);
  if (phone === "0") return "incomplete";
  // 5xxxxxxx typed without the leading zero, not yet nine digits.
  if (/^5\d{0,7}$/.test(phone)) return "incomplete";
  if (/^05\d{0,8}$/.test(phone) && phone.length < 10) return "incomplete";
  if (/^0[2-489]\d{0,7}$/.test(phone) && phone.length < 9) return "incomplete";
  return "invalid";
}

/** "0501234567" -> "050-123-4567", for display only. */
export function formatPhone(input: string): string {
  const phone = normalizePhone(input);
  if (/^05\d{8}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (/^0[2-489]\d{7}$/.test(phone)) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  return phone;
}
