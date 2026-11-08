import { assertEquals } from "jsr:@std/assert@1";
import { dayStart, israelDate, israelHour, israelOffset, israelParts } from "./time.ts";

Deno.test("israelParts reads midnight as hour 0 of the next day, not 24", () => {
  // 21:30 UTC in August is 00:30 IDT the next day; in December 22:30 UTC is 00:30 IST.
  assertEquals(israelParts(new Date("2026-08-01T21:30:00Z")), { date: "2026-08-02", hour: 0 });
  assertEquals(israelParts(new Date("2026-12-01T22:30:00Z")), { date: "2026-12-02", hour: 0 });
});

Deno.test("israelParts follows daylight saving", () => {
  assertEquals(israelHour(new Date("2026-08-01T18:54:00Z")), 21);
  assertEquals(israelHour(new Date("2026-12-01T18:54:00Z")), 20);
  assertEquals(israelDate(new Date("2026-12-01T18:54:00Z")), "2026-12-01");
});

Deno.test("israelOffset is +03:00 in summer and +02:00 in winter", () => {
  assertEquals(israelOffset(new Date("2026-07-01T12:00:00Z")), "+03:00");
  assertEquals(israelOffset(new Date("2026-01-01T12:00:00Z")), "+02:00");
});

Deno.test("dayStart is local midnight expressed as a UTC instant", () => {
  assertEquals(dayStart("2026-08-02").toISOString(), "2026-08-01T21:00:00.000Z");
  assertEquals(dayStart("2026-12-02").toISOString(), "2026-12-01T22:00:00.000Z");
});
