/**
 * Israeli formatting helpers.
 * Dates are dd.MM.yyyy, times are HH:mm (no seconds), money is ₪ with
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

/** Placeholder shown instead of an empty or unparsable value. */
export const EMPTY = "לא צוין";

/** "2026-04-16" -> "16.04.2026". Returns EMPTY for missing/invalid input. */
export function formatDate(value?: string | Date | null): string {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return dateFormatter.format(date).replace(/\//g, ".");
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
  return currencyFormatter.format(amount);
}

/** 0.5 -> "חצי שעה", 1 -> "שעה", 2 -> "שעתיים", 3 -> "3 שעות". */
export function formatDuration(hours?: number | null): string {
  if (!hours || Number.isNaN(hours) || hours <= 0) return EMPTY;
  if (hours === 0.5) return "חצי שעה";
  if (hours === 1) return "שעה";
  if (hours === 2) return "שעתיים";
  return `${hours} שעות`;
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
  return digits;
}

/** Israeli mobile (05X, 10 digits) or landline (0X, 9 digits). */
export function isValidPhone(input: string): boolean {
  const phone = normalizePhone(input);
  return /^05\d{8}$/.test(phone) || /^0[2-489]\d{7}$/.test(phone);
}

/** "0501234567" -> "050-123-4567", for display only. */
export function formatPhone(input: string): string {
  const phone = normalizePhone(input);
  if (/^05\d{8}$/.test(phone)) return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  if (/^0[2-489]\d{7}$/.test(phone)) return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  return phone;
}
