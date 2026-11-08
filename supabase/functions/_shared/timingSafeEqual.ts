/**
 * Compares without an early exit on the first differing byte, so response time
 * does not leak how much of a guessed secret was correct. Length is compared
 * up front and does leak: that is the standard trade-off and is harmless for
 * a fixed-length secret or signature.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
