import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CHANNEL_DEFAULTS, emailContent, pushPayload } from "../_shared/notificationCopy.ts";

Deno.test("approved review defaults to email and push with a profile link", () => {
  const row = { id: "notification", event_type: "review_approved" as const, data: { task_name: "הכנת קפה", review_id: "review" }, link: "/profile" };
  assertEquals(CHANNEL_DEFAULTS.review_approved, { email: true, push: true });
  assertStringIncludes(emailContent(row).subject, "דירוג");
  assertStringIncludes(pushPayload(row).body, "הכנת קפה");
  assertStringIncludes(pushPayload(row).url, "/profile");
});
