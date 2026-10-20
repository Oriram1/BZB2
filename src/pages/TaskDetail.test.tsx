import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import TaskDetail from "./TaskDetail";
const state = vi.hoisted(() => ({ fullDescription: "הסבר מפורט של מפרסם המשימה\nשורה נוספת", notes: "הערה חשובה של המפרסם" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, roles: [], profile: null }) }));
vi.mock("@/components/PageHeader", () => ({ default: () => <header>פרטי משימה</header> }));
vi.mock("@/components/tasks/TaskLocationMap", () => ({ default: () => <div data-testid="map">מפה</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{first_name: "מפרסם", last_name: "בדיקה"}] }),
  from: () => {
    const query = { select: () => query, eq: () => query, is: () => query,
      single: async () => ({data: {
        id: "task", name: "משימת בדיקה", short_desc: "התיאור הקצר המקורי", full_desc: state.fullDescription,
        notes: state.notes, creator_id: "publisher", category: "other", payment: 100,
        payment_type: "task", status: "open", workers_needed: 1, location: "מיקום בדיקה", views_count: 0,
      }, error: null}),
    }; return query;
  },
} }));
afterEach(cleanup);
const task = () => render(<MemoryRouter initialEntries={["/task/task"]}><Routes><Route path="/task/:id" element={<TaskDetail />} /></Routes></MemoryRouter>);
it("shows the publisher's full explanation and notes before location details", async () => {
  task();
  const description = await screen.findByText(/הסבר מפורט של מפרסם המשימה/);
  const notes = screen.getByText("הערה חשובה של המפרסם");
  const map = screen.getByTestId("map");
  expect(description.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notes.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(description).toHaveClass("whitespace-pre-wrap");
});
it("shows the original short explanation when no detailed description exists", async () => {
  state.fullDescription = "";
  task();
  const heading = await screen.findByRole("heading", {name: "תיאור המשימה"});
  expect(heading.parentElement?.parentElement).toHaveTextContent("התיאור הקצר המקורי");
});
