import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskAssistant, { type AssistantFields } from "./TaskAssistant";

const state = vi.hoisted(() => ({
  responses: [] as { data: unknown; error: unknown }[],
  bodies: [] as unknown[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: {
  invoke: (_name: string, { body }: { body: unknown }) => {
    state.bodies.push(body);
    return Promise.resolve(state.responses.shift());
  },
} } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const fields = (overrides: Partial<AssistantFields> = {}): AssistantFields => ({
  category: "housework", taskName: "ניקוי חלונות", shortDesc: "ניקוי חלונות בדירה", fullDesc: null,
  payment: 50, paymentType: "task", workers: 1, location: "רמת גן", date: null, time: null, duration: null, ...overrides,
});

beforeEach(() => { state.responses = []; state.bodies = []; });
afterEach(cleanup);

const say = (text: string) => {
  fireEvent.change(screen.getByLabelText("תיאור המטלה"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "שליחה" }));
};

it("asks only about what is missing, then hands a complete form back", async () => {
  const onApply = vi.fn();
  state.responses.push({ data: { fields: fields(), missing: ["date", "time"] }, error: null });
  state.responses.push({ data: { fields: fields({ date: "2026-11-04", time: "18:00" }), missing: [] }, error: null });
  render(<TaskAssistant onApply={onApply} onManual={vi.fn()} />);

  say("ניקוי חלונות ברמת גן, 50 שקל");
  expect(await screen.findByText("באיזה תאריך? באיזו שעה?")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "תשובות מהירות" })).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();

  say("מחר ב-18:00");
  await waitFor(() => expect(onApply).toHaveBeenCalledWith(fields({ date: "2026-11-04", time: "18:00" }), []));
  // The second call carries the whole conversation, including the question asked.
  expect(state.bodies[1]).toEqual({ messages: [
    { role: "user", text: "ניקוי חלונות ברמת גן, 50 שקל" },
    { role: "assistant", text: "באיזה תאריך? באיזו שעה?" },
    { role: "user", text: "מחר ב-18:00" },
  ] });
});

it("keeps the typed text when the assistant fails", async () => {
  state.responses.push({ data: null, error: new Error("down") });
  render(<TaskAssistant onApply={vi.fn()} onManual={vi.fn()} />);
  say("ניקוי חלונות");
  await waitFor(() => expect(screen.getByLabelText("תיאור המטלה")).toHaveValue("ניקוי חלונות"));
});

it("lets the person skip to the manual form", () => {
  const onManual = vi.fn();
  render(<TaskAssistant onApply={vi.fn()} onManual={onManual} />);
  fireEvent.click(screen.getByRole("button", { name: /אמלא בעצמי/ }));
  expect(onManual).toHaveBeenCalled();
});
