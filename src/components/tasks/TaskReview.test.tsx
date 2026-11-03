import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskReview from "./TaskReview";
import { assistantChanges, fieldError, type ReviewForm } from "@/lib/taskReview";

const state = vi.hoisted(() => ({ response: null as unknown, bodies: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: {
  invoke: (_name: string, { body }: { body: unknown }) => { state.bodies.push(body); return Promise.resolve(state.response); },
} } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const form: ReviewForm = {
  category: "housework", taskName: "ניקוי בתים", shortDesc: "ניקוי בית בתל אביב", fullDesc: "",
  payment: "40", paymentType: "task", workers: "1", location: "תל אביב", date: "2099-01-02", time: "16:00",
  duration: "", durationUnit: "days", expiry: "3", notes: "",
};

// The first render loads every lucide icon the review uses; on a busy machine that alone passes 5s.
vi.setConfig({ testTimeout: 30_000 });
beforeEach(() => { state.response = null; state.bodies = []; });
afterEach(cleanup);

it("validates edits with the wizard's own rules", () => {
  expect(fieldError("payment", "0")).toBe("סכום גדול מ-0");
  expect(fieldError("time", "25:00")).toBe("שעה בפורמט HH:MM");
  expect(fieldError("date", "2000-01-01")).toBe("תאריך מהיום והלאה");
  expect(fieldError("duration", "")).toBeNull();
  expect(fieldError("taskName", " ")).toBe("שדה חובה");
});

it("turns assistant output into changes without clearing what it left out", () => {
  const changes = assistantChanges({
    category: "housework", taskName: "ניקוי בתים", shortDesc: null, fullDesc: null, payment: 60, paymentType: null,
    workers: null, location: null, date: null, time: "10:00", duration: null,
  }, form);
  expect(changes).toEqual({ payment: "60", time: "10:00" });
});

it("edits a field in place", () => {
  const onChange = vi.fn();
  render(<TaskReview form={form} imagePreview={null} insurance={false} onChange={onChange} onOpenExtras={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "עריכת כותרת" }));
  fireEvent.change(screen.getByLabelText("כותרת"), { target: { value: "ניקוי דירה" } });
  fireEvent.click(screen.getByRole("button", { name: /שמירה/ }));
  expect(onChange).toHaveBeenCalledWith({ taskName: "ניקוי דירה" });
});

it("refuses to save an invalid value", () => {
  const onChange = vi.fn();
  render(<TaskReview form={form} imagePreview={null} insurance={false} onChange={onChange} onOpenExtras={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "עריכת תשלום" }));
  fireEvent.change(screen.getByLabelText("תשלום"), { target: { value: "0" } });
  expect(screen.getByRole("alert")).toHaveTextContent("סכום גדול מ-0");
  expect(screen.getByRole("button", { name: /שמירה/ })).toBeDisabled();
});

it("applies a change asked of Busy", async () => {
  const onChange = vi.fn();
  state.response = { data: { fields: { ...form, payment: 60, workers: 1, duration: null, fullDesc: null } }, error: null };
  render(<TaskReview form={form} imagePreview={null} insurance={false} onChange={onChange} onOpenExtras={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/תגידו לביזי/), { target: { value: "תעלה ל-60" } });
  fireEvent.click(screen.getByRole("button", { name: "שליחה לביזי" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith({ payment: "60" }));
  // The assistant sees the current task, not just the request.
  expect(JSON.stringify(state.bodies[0])).toContain("תשלום: 40");
});

it("lists optional details that were never filled", () => {
  const onOpenExtras = vi.fn();
  render(<TaskReview form={form} imagePreview={null} insurance={false} onChange={vi.fn()} onOpenExtras={onOpenExtras} />);
  const optional = screen.getByRole("region", { name: "פרטים אופציונליים" });
  expect(optional).toHaveTextContent("תיאור מפורט");
  expect(optional).toHaveTextContent("ביטוח");
  fireEvent.click(screen.getByRole("button", { name: /תמונה/ }));
  expect(onOpenExtras).toHaveBeenCalled();
});
