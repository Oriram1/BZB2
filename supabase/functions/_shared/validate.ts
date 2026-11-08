const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 5321 limit on a mailbox address. */
export const EMAIL_MAX_LENGTH = 254;

export const isUuid = (value: string) => UUID.test(value);

/** Trimmed, lower-cased address, or `null` when the input is not a plausible email. */
export function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= EMAIL_MAX_LENGTH && EMAIL.test(email) ? email : null;
}

/** Family-link codes are stored only as this hash, never in clear text. */
export async function hashFamilyCode(code: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
