import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import CreateTask from "./CreateTask";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/taskFees", () => ({ useTaskFees: () => null, feeText: () => "" }));
vi.mock("@/lib/taskBilling", () => ({
  fetchPublishQuote: async () => null, payTaskOnce: vi.fn(), startTaskCardSetup: vi.fn(), TASK_DRAFT_KEY: "test-draft",
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/components/PageHeader", () => ({ default: ({ onBack }: { onBack?: () => void }) => <button onClick={onBack}>חזרה למסך הקודם</button> }));
vi.mock("@/components/tasks/GoogleMapPicker", () => ({ default: () => null }));
afterEach(cleanup);

it("keeps the assistant text when returning from manual category selection", () => {
  render(<MemoryRouter><CreateTask /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("תיאור המטלה"), { target: { value: "צריך עזרה בגינה" } });
  fireEvent.click(screen.getByRole("button", { name: "אמלא בעצמי" }));
  expect(screen.getByRole("group", { name: "בחירת קטגוריה" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "חזרה למסך הקודם" }));
  expect(screen.getByLabelText("תיאור המטלה")).toHaveValue("צריך עזרה בגינה");
});
