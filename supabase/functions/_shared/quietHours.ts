/**
 * Quiet-hours arithmetic, kept free of I/O on purpose.
 *
 * Everything here is a pure function so vitest can reach it from src/ — the
 * edge functions themselves import Deno and remote modules that the browser
 * test runner cannot load. Nothing in this file may import either.
 */

const TIME_ZONE = "Asia/Jerusalem";

export const QUIET_DEFAULTS = { enabled: true, start: 22, end: 7 } as const;

export type QuietSettings = {
  quiet_hours_enabled: boolean | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

export type HeldNotification = { conversation_id: string; sender_name: string };

export type DigestCard = { title: string; lines: string[]; url: string };

/**
 * `notification_settings` is sparse: a row appears only once someone changes a
 * setting, so the column DEFAULTs never apply to the majority of accounts. The
 * defaults have to live here instead, the same way CHANNEL_DEFAULTS covers the
 * equally sparse notification_preferences.
 */
export function resolveQuietHours(settings: QuietSettings | null) {
  return {
    enabled: settings?.quiet_hours_enabled ?? QUIET_DEFAULTS.enabled,
    start: settings?.quiet_hours_start ?? QUIET_DEFAULTS.start,
    end: settings?.quiet_hours_end ?? QUIET_DEFAULTS.end,
  };
}

/** The window usually wraps midnight (22 -> 7), so the test has two shapes. */
export function inQuietWindow(hour: number, start: number, end: number) {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

function israelParts(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
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
  const hour = Number(parts.hour) % 24;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

export function israelHour(now: Date) {
  return israelParts(now).hour;
}

export function israelDate(now: Date) {
  return israelParts(now).date;
}

/** Israel's UTC offset, as the "+03:00" suffix a Date constructor accepts. */
function israelOffset(now: Date) {
  const label =
    new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+03:00";
  return label.replace("GMT", "") || "+03:00";
}

/**
 * The UTC instant at which the quiet window that just ended began. Called at
 * the end hour, so a wrapping window started yesterday and a non-wrapping one
 * started earlier today.
 */
export function quietWindowStart(now: Date, start: number, end: number) {
  const { date } = israelParts(now);
  const offset = israelOffset(now);
  const hh = String(start).padStart(2, "0");
  const sameDay = new Date(`${date}T${hh}:00:00${offset}`);
  if (start <= end) return sameDay;
  return new Date(sameDay.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * One card per conversation, busiest first, so the email leads with whoever
 * actually needs a reply rather than whoever happened to message first.
 */
export function buildDigestCards(rows: HeldNotification[], siteBase: string): DigestCard[] {
  const byConversation = new Map<string, { sender: string; count: number }>();

  for (const row of rows) {
    const existing = byConversation.get(row.conversation_id);
    if (existing) {
      existing.count += 1;
    } else {
      byConversation.set(row.conversation_id, { sender: row.sender_name, count: 1 });
    }
  }

  return [...byConversation.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([conversationId, { sender, count }]) => ({
      title: sender,
      lines: [count === 1 ? "הודעה אחת" : `${count} הודעות`],
      url: `${siteBase}/chat?conversation=${conversationId}`,
    }));
}
