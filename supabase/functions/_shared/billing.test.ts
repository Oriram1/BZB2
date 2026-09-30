import { assertEquals } from "jsr:@std/assert@1";
import type { LowProfileResult } from "./cardcom.ts";
import { evaluateLowProfileResult, evaluateTransaction, planFailure, RETRY_OFFSETS_DAYS } from "./billing.ts";

const order = { id: "11111111-1111-1111-1111-111111111111", amount: "30.00" };
const TERMINAL = 197542;

const paidResult = (): LowProfileResult => ({
  ResponseCode: 0,
  TerminalNumber: TERMINAL,
  ReturnValue: order.id,
  TranzactionId: 555,
  TokenInfo: { Token: "tok-1", CardMonth: 4, CardYear: 2029 },
  TranzactionInfo: { ResponseCode: 0, Amount: 30, TranzactionId: 555, Last4CardDigitsString: "4580" },
});

Deno.test("a matching, successful hosted-page result is paid and carries the token", () => {
  const verdict = evaluateLowProfileResult(paidResult(), order, TERMINAL);
  assertEquals(verdict.kind, "paid");
  if (verdict.kind === "paid") {
    assertEquals(verdict.details.dealNumber, 555);
    assertEquals(verdict.details.token, "tok-1");
    assertEquals(verdict.details.last4, "4580");
    assertEquals(verdict.details.expiry, "0429");
  }
});

Deno.test("a result for a different order is rejected, however successful it looks", () => {
  const verdict = evaluateLowProfileResult({ ...paidResult(), ReturnValue: "someone-elses-order" }, order, TERMINAL);
  assertEquals(verdict, { kind: "failed", reason: "order_mismatch", code: 0 });
});

Deno.test("a result from another terminal is rejected", () => {
  assertEquals(evaluateLowProfileResult(paidResult(), order, 999).kind, "failed");
});

Deno.test("a different amount than the order is rejected, so a cheap payment cannot buy the plan", () => {
  const cheap = paidResult();
  cheap.TranzactionInfo!.Amount = 1;
  const verdict = evaluateLowProfileResult(cheap, order, TERMINAL);
  assertEquals(verdict, { kind: "failed", reason: "amount_mismatch", code: 0 });
});

Deno.test("no card transaction yet means the customer has not finished: pending, not failed", () => {
  const verdict = evaluateLowProfileResult(
    { ResponseCode: 0, TerminalNumber: TERMINAL, ReturnValue: order.id },
    order,
    TERMINAL,
  );
  assertEquals(verdict, { kind: "pending" });
});

Deno.test("a declined card is a failure with Cardcom's reason", () => {
  const declined = paidResult();
  declined.TranzactionInfo = { ResponseCode: 5033, Description: "declined" };
  assertEquals(evaluateLowProfileResult(declined, order, TERMINAL), { kind: "failed", reason: "declined", code: 5033 });
});

Deno.test("a token charge: 0 is paid, 608 is a repeat to look up, anything else is a decline", () => {
  assertEquals(evaluateTransaction({ ResponseCode: 0, Amount: 30, TranzactionId: 9 }, order).kind, "paid");
  assertEquals(evaluateTransaction({ ResponseCode: 608 }, order), { kind: "duplicate" });
  assertEquals(evaluateTransaction({ ResponseCode: 39, Description: "no funds" }, order), {
    kind: "failed",
    reason: "no funds",
    code: 39,
  });
  assertEquals(evaluateTransaction({ ResponseCode: 0, Amount: 12 }, order), {
    kind: "failed",
    reason: "amount_mismatch",
    code: 0,
  });
});

Deno.test("retries land on days 3 and 7 after the period ended, then the subscription expires", () => {
  const periodEnd = new Date("2026-12-30T10:00:00Z");
  assertEquals(RETRY_OFFSETS_DAYS, [0, 3, 7]);

  const afterFirst = planFailure(0, periodEnd);
  assertEquals(afterFirst.expired, false);
  if (!afterFirst.expired) {
    assertEquals(afterFirst.attempts, 1);
    assertEquals(afterFirst.nextAttemptAt.toISOString(), "2027-01-02T10:00:00.000Z");
  }

  const afterSecond = planFailure(1, periodEnd);
  if (!afterSecond.expired) assertEquals(afterSecond.nextAttemptAt.toISOString(), "2027-01-06T10:00:00.000Z");

  assertEquals(planFailure(2, periodEnd), { expired: true });
});
