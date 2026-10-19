/**
 * Checking that a card can actually pay before a free month starts.
 *
 * Saving a card for the free month charges nothing, and with an amount of 0
 * Cardcom only confirms the card exists. A card that is stolen, blocked or empty
 * saves fine and the first real charge, a month later, is the first time anyone
 * finds out. Asking Cardcom for a J5 authorization of a small amount makes the
 * card issuer answer for it up front. J5 is an authorization only: nothing is
 * captured, so the customer is not charged.
 *
 * Cardcom reports a successful J2 or J5 as 700 or 701 instead of 0.
 */

/** Amount asked of the issuer, in shekels. 0 turns the check off. */
export function cardCheckAmount(raw: string | undefined = undefined): number {
  const value = raw === undefined ? 1 : Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || value > 10) return 1;
  return Math.round(value * 100) / 100;
}

/** J5 authorization, as `JValidateType` in Cardcom's advanced definition. */
export const J5 = 5;

/** A card-save result that means the card is fine. */
export function isCardCheckSuccess(code: number | null | undefined): boolean {
  return code === 0 || code === 700 || code === 701;
}
