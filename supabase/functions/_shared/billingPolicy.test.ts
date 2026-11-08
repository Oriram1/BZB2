import { assertEquals } from "jsr:@std/assert@1";
import { cardExpired, graceEnd, round2 } from "./billingPolicy.ts";

Deno.test("a card is expired from the first instant of the month after its expiry", () => {
  assertEquals(cardExpired("0429", new Date("2029-04-30T23:59:59Z")), false);
  assertEquals(cardExpired("0429", new Date("2029-05-01T00:00:00Z")), true);
});

Deno.test("an expiry that cannot be read never blocks a charge", () => {
  for (const expiry of [null, undefined, "", "1329", "0029", "04-29"]) assertEquals(cardExpired(expiry), false);
});

Deno.test("access is honoured until the last retry day after the period ended", () => {
  assertEquals(graceEnd("2026-12-30T10:00:00Z").toISOString(), "2027-01-13T10:00:00.000Z");
});

Deno.test("amounts are rounded to whole agorot", () => {
  assertEquals(round2(100 / 3), 33.33);
  assertEquals(round2(0.1 + 0.2), 0.3);
});
