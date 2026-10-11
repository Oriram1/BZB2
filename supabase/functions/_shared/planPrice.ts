/**
 * Tamper evidence for plan prices.
 *
 * Encrypting the amount in the database would not help: the server has to read
 * it to charge, so whoever can run code as the server can decrypt it, and whoever
 * can write the row can write an encrypted value as easily as a plain one. What
 * does help is making a change detectable and refusable: each plan row carries
 * an HMAC-SHA256 over (id, amount, period) made with a key that is held only in
 * the Edge Function environment. Billing recomputes the HMAC before charging and
 * refuses a plan whose signature does not match, so a modified row is never
 * charged. The key is not in the database, so database access alone cannot forge
 * a valid signature.
 */
const encoder = new TextEncoder();

export class PlanIntegrityError extends Error {
  constructor(public planId: string, message = "plan_price_integrity") {
    super(message);
  }
}

type SignablePlan = { id: string; amount: number | string; period_months: number };

/** Versioned, fixed-format string; two decimals so 30 and "30.00" sign the same. */
export function canonicalPlan(plan: SignablePlan): string {
  return `v1|${plan.id}|${Number(plan.amount).toFixed(2)}|${plan.period_months}`;
}

async function importKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("BILLING_PRICE_SIGNING_KEY");
  if (!secret || secret.length < 32) throw new Error("price_signing_not_configured");
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function signPlan(plan: SignablePlan): Promise<string> {
  const key = await importKey();
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonicalPlan(plan))));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPlan(plan: SignablePlan & { price_signature?: string | null }): Promise<boolean> {
  if (!plan.price_signature) return false;
  return timingSafeEqual(await signPlan(plan), plan.price_signature);
}
