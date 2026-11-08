import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { emailContent, pushPayload } from "../_shared/notificationCopy.ts";
import { CHANNEL_DEFAULTS, type NotificationRow } from "../_shared/notificationEvents.ts";

const EVENTS = ["review_approved", "review_reminder", "review_rejected", "review_response_approved", "review_report_resolved", "review_appeal_resolved"] as const;

for (const event of EVENTS) {
  Deno.test(`${event} renders a complete email and push with a profile link`, () => {
    const row = { id: "n1", event_type: event, data: { task_name: "ניקיון דירה", review_id: "r1", task_id: "t1", report_id: "p1", kind: "last", removed: true }, link: "/profile" } as unknown as NotificationRow;
    const email = emailContent(row);
    const push = pushPayload(row);
    for (const text of [email.subject, email.heading, push.title, push.body]) assert(text.trim().length > 3, `${event}: empty text`);
    assert((email.paragraphs?.length ?? 0) > 0 && email.action?.url, `${event}: email lacks body or action`);
    assertStringIncludes(push.url, "/");
    assert(push.tag, `${event}: push lacks a collapse tag`);
    assert(event in CHANNEL_DEFAULTS, `${event}: missing channel defaults`);
  });
}

Deno.test("the reminder is push-only by default and the rest use both channels", () => {
  assertEquals(CHANNEL_DEFAULTS.review_reminder, { email: false, push: true });
  assertEquals(CHANNEL_DEFAULTS.review_approved, { email: true, push: true });
});
