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
vi.mock("./AssistantLocation", () => ({
  default: ({ query, onConfirm }: { query: string; onConfirm: (location: unknown) => void }) =>
    <button onClick={() => onConfirm({ query, formattedAddress: "כתובת מאושרת", lat: 32.08, lng: 34.78 })}>אישור נקודת המפגש</button>,
}));
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

it("asks one missing question and waits for review before applying the draft", async () => {
  const onApply = vi.fn();
  state.responses.push({ data: { fields: fields(), missing: ["date", "time"] }, error: null });
  state.responses.push({ data: { fields: fields({ date: "2026-11-04", time: "18:00" }), missing: [] }, error: null });
  render(<TaskAssistant onApply={onApply} onManual={vi.fn()} />);

  say("ניקוי חלונות ברמת גן, 50 שקל");
  expect(await screen.findByText("באיזה תאריך?")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "תשובות מהירות" })).toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading", { name: "טיוטת המטלה" })).not.toBeInTheDocument();

  say("מחר ב-18:00");
  await screen.findByRole("button", { name: "אישור נקודת המפגש" });
  expect(screen.queryByRole("button", { name: "בדיקת המטלה" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "אישור נקודת המפגש" }));
  await screen.findByRole("button", { name: "בדיקת המטלה" });
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "טיוטת המטלה" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "בדיקת המטלה" }));
  expect(onApply).toHaveBeenCalledWith(fields({ date: "2026-11-04", time: "18:00" }), [], { query: "רמת גן", formattedAddress: "כתובת מאושרת", lat: 32.08, lng: 34.78 });
  // The second call carries the whole conversation, including the question asked.
  expect(state.bodies[1]).toEqual({ messages: [
    { role: "user", text: "ניקוי חלונות ברמת גן, 50 שקל" },
    { role: "assistant", text: "באיזה תאריך?" },
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


it("continues collecting missing details after four answers without opening the form", async () => {
  const onApply = vi.fn();
  render(<TaskAssistant onApply={onApply} onManual={vi.fn()} />);
  for (let turn = 0; turn < 7; turn++) {
    state.responses.push({ data: { fields: fields(), missing: ["location"] }, error: null });
    say("עוד פרטים " + turn);
    await waitFor(() => expect(screen.getAllByText("באיזו כתובת או עיר?")).toHaveLength(turn + 1));
    expect(screen.queryByRole("heading", { name: "טיוטת המטלה" })).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  }
});

it("requires a new location confirmation when the conversation changes the address", async () => {
  state.responses.push({ data: { fields: fields(), missing: ["time"] }, error: null });
  state.responses.push({ data: { fields: fields({ location: "חיפה", time: "09:00", date: "2026-11-09" }), missing: [] }, error: null });
  render(<TaskAssistant onApply={vi.fn()} onManual={vi.fn()} />);
  say("רמת גן");
  fireEvent.click(await screen.findByRole("button", { name: "אישור נקודת המפגש" }));
  say("בעצם בחיפה ביום שני בשעה תשע");
  await screen.findByText("נשאר לאשר את נקודת המפגש במפה לפני בדיקת המטלה.");
  expect(screen.queryByRole("button", { name: "בדיקת המטלה" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "אישור נקודת המפגש" }));
  expect(screen.getByRole("button", { name: "בדיקת המטלה" })).toBeInTheDocument();
});
