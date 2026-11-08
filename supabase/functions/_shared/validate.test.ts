import { assertEquals } from "jsr:@std/assert@1";
import { EMAIL_MAX_LENGTH, hashFamilyCode, isUuid, normalizeEmail } from "./validate.ts";

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

Deno.test("hashFamilyCode is the lower-case hex SHA-256 of the code", async () => {
  assertEquals(await hashFamilyCode("123456"), "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92");
  assertEquals((await hashFamilyCode("000000")).length, 64);
});
