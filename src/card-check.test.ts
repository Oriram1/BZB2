import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cardCheckAmount, isCardCheckSuccess, J5 } from "../supabase/functions/_shared/cardCheck";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("card check amount", () => {
  it("asks the issuer for 1 shekel unless told otherwise", () => {
    expect(cardCheckAmount(undefined)).toBe(1);
    expect(cardCheckAmount("1")).toBe(1);
  });

  it("can be set, and 0 switches the check off", () => {
    expect(cardCheckAmount("2.5")).toBe(2.5);
    expect(cardCheckAmount("0")).toBe(0);
  });

  it("falls back to 1 for nonsense or a large amount instead of authorizing it", () => {
    expect(cardCheckAmount("abc")).toBe(1);
    expect(cardCheckAmount("-3")).toBe(1);
    expect(cardCheckAmount("500")).toBe(1);
  });
});

describe("card check result", () => {
  it("treats 0, 700 and 701 as a card that is fine", () => {
    for (const code of [0, 700, 701]) expect(isCardCheckSuccess(code), String(code)).toBe(true);
  });

  it("refuses everything else, including a stolen card and a missing code", () => {
    for (const code of [60000002, 5, 33, 608]) expect(isCardCheckSuccess(code), String(code)).toBe(false);
    expect(isCardCheckSuccess(null)).toBe(false);
    expect(isCardCheckSuccess(undefined)).toBe(false);
  });

  it("uses J5, an authorization", () => {
    expect(J5).toBe(5);
  });
});

describe("hard declines", () => {
  it("are read from BILLING_HARD_DECLINE_CODES, and empty means every decline is soft", () => {
    const billing = read("supabase/functions/_shared/billing.ts");
    expect(billing).toContain('Deno.env.get("BILLING_HARD_DECLINE_CODES")');
    expect(billing).toContain("Empty means every decline is treated as soft.");
    expect(billing).toContain("return code !== null && code !== undefined && codes.has(code);");
  });
});

describe("card check wiring", () => {
  it("sends J5 with the amount only when a check is requested", () => {
    const cardcom = read("supabase/functions/_shared/cardcom.ts");
    expect(cardcom).toContain("AdvancedDefinition: params.cardCheckAmount && params.cardCheckAmount > 0 ? { JValidateType: J5 } : undefined");
    expect(cardcom).toContain("params.cardCheckAmount && params.cardCheckAmount > 0 ? params.cardCheckAmount : params.amount");
  });

  it("asks for it when the free month card is saved, and accepts 700/701 on the way back", () => {
    expect(read("supabase/functions/billing-start-trial/index.ts")).toContain("cardCheckAmount: cardCheckAmount(");
    expect(read("supabase/functions/_shared/taskBilling.ts")).toContain("tx && !isCardCheckSuccess(tx.ResponseCode)");
  });

  it("never records the authorization amount as money taken", () => {
    // The trial's charge row stays at 0: the check is not a payment.
    const trial = read("supabase/functions/billing-start-trial/index.ts");
    expect(trial).toMatch(/purpose: "card_setup",\s*plan_id: plan\.id,\s*amount: 0/);
  });
});
