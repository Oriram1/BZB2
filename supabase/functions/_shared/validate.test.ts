import { assertEquals } from "jsr:@std/assert@1";
import { EMAIL_MAX_LENGTH, isUuid, normalizeEmail } from "./validate.ts";

Deno.test("normalizeEmail trims and lower-cases a valid address", () => {
  assertEquals(normalizeEmail("  Parent@Example.COM "), "parent@example.com");
});

Deno.test("normalizeEmail rejects malformed, blank and missing input", () => {
  for (const value of ["", "   ", undefined, null, "no-at-sign", "a@b", "a b@c.d", "a@@c.d"]) {
    assertEquals(normalizeEmail(value), null, String(value));
  }
});

Deno.test("normalizeEmail enforces the 254 character limit", () => {
  const atLimit = `${"a".repeat(EMAIL_MAX_LENGTH - "@x.io".length)}@x.io`;
  assertEquals(atLimit.length, EMAIL_MAX_LENGTH);
  assertEquals(normalizeEmail(atLimit), atLimit);
  assertEquals(normalizeEmail(`a${atLimit}`), null);
});

Deno.test("isUuid accepts any hex UUID shape and nothing else", () => {
  assertEquals(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assertEquals(isUuid("11111111-1111-4111-8111-11111111111"), false);
  assertEquals(isUuid("not-a-uuid"), false);
});
