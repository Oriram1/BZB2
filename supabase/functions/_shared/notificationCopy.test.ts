import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { emailContent, pushPayload } from "./notificationCopy.ts";
import { CHANNEL_DEFAULTS, type NotificationRow } from "./notificationEvents.ts";

const REVIEW_EVENTS = [
  "review_approved",
  "review_reminder",
  "review_rejected",
  "review_response_approved",
  "review_report_resolved",
  "review_appeal_resolved",
] as const;

for (const event of REVIEW_EVENTS) {
  Deno.test(`${event} renders a complete email and push with a profile link`, () => {
    const row = {
      id: "n1",
      event_type: event,
      data: { task_name: "ניקיון דירה", review_id: "r1", task_id: "t1", report_id: "p1", kind: "last", removed: true },
      link: "/profile",
    } as NotificationRow;
    const email = emailContent(row);
    const push = pushPayload(row);
    for (const text of [email.subject, email.heading, push.title, push.body]) assert(text.trim().length > 3, `${event}: empty text`);
    assert((email.paragraphs?.length ?? 0) > 0 && email.action?.url, `${event}: email lacks body or action`);
    assertStringIncludes(push.url, "/profile");
    assert(push.tag, `${event}: push lacks a collapse tag`);
    assert(event in CHANNEL_DEFAULTS, `${event}: missing channel defaults`);
  });
}

Deno.test("an approved review names the task in the push and the rating in the email", () => {
  const row = { id: "n", event_type: "review_approved", data: { task_name: "הכנת קפה", review_id: "r" }, link: "/profile" } as NotificationRow;
  assertStringIncludes(emailContent(row).subject, "דירוג");
  assertStringIncludes(pushPayload(row).body, "הכנת קפה");
});

Deno.test("the review reminder is push-only by default and the rest use both channels", () => {
  assertEquals(CHANNEL_DEFAULTS.review_reminder, { email: false, push: true });
  assertEquals(CHANNEL_DEFAULTS.review_approved, { email: true, push: true });
});
