import { assertEquals } from "jsr:@std/assert@1";
import { paymentFailureReason } from "./paymentFailure.ts";

Deno.test("payment failure categories do not expose vendor text", () => {
  assertEquals(paymentFailureReason({ error: "private provider message", response_code: 5033 }), "card_declined");
  assertEquals(paymentFailureReason({ error: "amount_mismatch", response_code: 0 }), "verification_failed");
  assertEquals(paymentFailureReason({ error: "create_failed" }), "provider_unavailable");
  assertEquals(paymentFailureReason(null), "unknown");
});
