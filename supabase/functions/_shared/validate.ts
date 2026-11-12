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
