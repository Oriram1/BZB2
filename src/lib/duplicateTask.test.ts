import { expect, it } from "vitest";
import { duplicateTaskDraft } from "./duplicateTask";
import { fieldError } from "./taskForm";

it("copies the existing task details into a new draft", () => {
  const draft = duplicateTaskDraft({
    category: "housework", name: "ניקוי חלונות", short_desc: "ארבעה חלונות", full_desc: "כולל מסגרות",
    payment: 100, payment_type: "task", workers_needed: 2, location: "תל אביב", latitude: 32.1, longitude: 34.8,
    duration_hours: 48, expiry_hours: 72, notes: "להביא ציוד", tags: ["physical"], scheduled_date: "2026-12-30", scheduled_time: "12:30:00", image_url: "https://example.com/task.jpg", insurance: true,
  });
  expect(draft.form).toMatchObject({ category: "housework", taskName: "ניקוי חלונות", shortDesc: "ארבעה חלונות", fullDesc: "כולל מסגרות", payment: "100", paymentType: "task", workers: "2", location: "תל אביב", duration: "2", expiry: "3", notes: "להביא ציוד", date: "2026-12-30", time: "12:30" });
  expect(draft).toMatchObject({ lat: 32.1, lng: 34.8, tags: ["physical"], imageUrl: "https://example.com/task.jpg", insurance: true });
});

it("preserves durations expressed as hours", () => {
  const draft = duplicateTaskDraft({
    category: "housework", name: "ניקוי", short_desc: "ניקוי חלונות", full_desc: "כולל מסגרות",
    payment: 100, payment_type: "task", workers_needed: 1, location: "תל אביב", latitude: null,
    longitude: null, duration_hours: 2, expiry_hours: 36, notes: null, tags: [], scheduled_date: null, scheduled_time: null, image_url: null, insurance: false,
  });
  expect(draft.form.duration).toBe("2");
  expect(draft.form.durationUnit).toBe("hours");
  expect(draft.form.expiry).toBe("36");
  expect(draft.form.expiryUnit).toBe("hours");
  expect(fieldError("expiry", "36", draft.form)).toBeNull();
  expect(fieldError("duration", "48", draft.form)).toBeNull();
});
