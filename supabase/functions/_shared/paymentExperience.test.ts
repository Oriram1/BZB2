import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { emailContent } from "./notificationCopy.ts";
import { paymentFailureReason } from "./paymentFailure.ts";

Deno.test("card replacement email says what changed without inventing a card suffix", () => {
  const row = { id: "n1", event_type: "billing_plan_changed" as const, data: { kind: "card_updated", card_last4: "2444" }, link: "/subscription" };
  const content = emailContent(row);
  assertEquals(content.subject, "כרטיס האשראי שלכם עודכן");
  assertStringIncludes(content.paragraphs!.join(" "), "2444");
  assertStringIncludes(content.paragraphs!.join(" "), "לא בוצע חיוב");
  const withoutLast4 = emailContent({ ...row, data: { kind: "card_updated", card_last4: "" } });
  assertEquals(withoutLast4.paragraphs!.join(" ").includes("שמסתיים"), false);
});
Deno.test("payment failure categories do not expose vendor text", () => {
  assertEquals(paymentFailureReason({ error: "private provider message", response_code: 5033 }), "card_declined");
  assertEquals(paymentFailureReason({ error: "amount_mismatch", response_code: 0 }), "verification_failed");
  assertEquals(paymentFailureReason({ error: "create_failed" }), "provider_unavailable");
  assertEquals(paymentFailureReason(null), "unknown");
});

Deno.test("manual payment approval does not describe a declined card", () => {
  const content = emailContent({ id: "manual", event_type: "task_payment_failed", data: {
    task_name: "test", amount: 8, reason: "manual_payment_required",
  }, link: "/my-tasks?tab=published" });
  assertEquals(content.heading, "המטלה אושרה - נדרש תשלום");
  assertStringIncludes(content.paragraphs!.join(" "), "הכרטיס השמור לא חויב");
  assertEquals(content.paragraphs!.join(" ").includes("נדחה"), false);
});
