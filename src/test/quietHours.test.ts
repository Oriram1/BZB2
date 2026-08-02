import { describe, expect, it } from "vitest";
import {
  QUIET_DEFAULTS,
  buildDigestCards,
  inQuietWindow,
  israelDate,
  israelHour,
  quietWindowStart,
  resolveQuietHours,
} from "../../supabase/functions/_shared/quietHours.ts";

describe("resolveQuietHours", () => {
  it("falls back to 22->7 enabled when the row is missing", () => {
    expect(resolveQuietHours(null)).toEqual({ enabled: true, start: 22, end: 7 });
    expect(QUIET_DEFAULTS).toEqual({ enabled: true, start: 22, end: 7 });
  });

  it("honours an explicit row, including a disabled one", () => {
    expect(
      resolveQuietHours({ quiet_hours_enabled: false, quiet_hours_start: 23, quiet_hours_end: 6 }),
    ).toEqual({ enabled: false, start: 23, end: 6 });
  });

  it("fills per-column nulls from the defaults", () => {
    expect(
      resolveQuietHours({ quiet_hours_enabled: true, quiet_hours_start: null, quiet_hours_end: null }),
    ).toEqual({ enabled: true, start: 22, end: 7 });
  });
});

describe("inQuietWindow", () => {
  it("wraps midnight for the 22->7 default", () => {
    expect(inQuietWindow(23, 22, 7)).toBe(true);
    expect(inQuietWindow(2, 22, 7)).toBe(true);
    expect(inQuietWindow(22, 22, 7)).toBe(true);
    expect(inQuietWindow(7, 22, 7)).toBe(false);
    expect(inQuietWindow(21, 22, 7)).toBe(false);
    expect(inQuietWindow(21, 22, 7)).toBe(false);
  });

  it("handles a window that does not wrap", () => {
    expect(inQuietWindow(14, 13, 16)).toBe(true);
    expect(inQuietWindow(16, 13, 16)).toBe(false);
    expect(inQuietWindow(9, 13, 16)).toBe(false);
  });
});

describe("israelHour and israelDate", () => {
  it("converts a UTC instant to the Israel wall clock", () => {
    expect(israelHour(new Date("2026-08-01T18:54:00Z"))).toBe(21);
    expect(israelDate(new Date("2026-08-01T18:54:00Z"))).toBe("2026-08-01");
    expect(israelHour(new Date("2026-08-01T21:30:00Z"))).toBe(0);
    expect(israelDate(new Date("2026-08-01T21:30:00Z"))).toBe("2026-08-02");
  });
});

describe("quietWindowStart", () => {
  it("returns last night's 22:00 when the job runs at 07:00", () => {
    const start = quietWindowStart(new Date("2026-08-02T04:00:00Z"), 22, 7);
    expect(start.toISOString()).toBe("2026-08-01T19:00:00.000Z");
  });

  it("stays on the same day when the window does not wrap", () => {
    const start = quietWindowStart(new Date("2026-08-02T13:00:00Z"), 13, 16);
    expect(start.toISOString()).toBe("2026-08-02T10:00:00.000Z");
  });
});

describe("buildDigestCards", () => {
  const base = "https://bzb-2.vercel.app";

  it("collapses repeats from one conversation into a single card", () => {
    const cards = buildDigestCards(
      [
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c1", sender_name: "יוסי" },
      ],
      base,
    );
    expect(cards).toEqual([
      { title: "יוסי", lines: ["3 הודעות"], url: `${base}/chat?conversation=c1` },
    ]);
  });

  it("uses the singular for exactly one message", () => {
    const cards = buildDigestCards([{ conversation_id: "c1", sender_name: "דנה" }], base);
    expect(cards[0].lines).toEqual(["הודעה אחת"]);
  });

  it("keeps conversations separate and orders by volume", () => {
    const cards = buildDigestCards(
      [
        { conversation_id: "c1", sender_name: "יוסי" },
        { conversation_id: "c2", sender_name: "דנה" },
        { conversation_id: "c2", sender_name: "דנה" },
      ],
      base,
    );
    expect(cards.map((card) => card.title)).toEqual(["דנה", "יוסי"]);
  });

  it("returns nothing for an empty collection", () => {
    expect(buildDigestCards([], base)).toEqual([]);
  });
});
