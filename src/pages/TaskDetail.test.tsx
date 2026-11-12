import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import TaskDetail from "./TaskDetail";
const state = vi.hoisted(() => ({ fullDescription: "הסבר מפורט של מפרסם המשימה\nשורה נוספת", notes: "הערה חשובה של המפרסם", rating: { avg_rating: 4.8, review_count: 12 } as { avg_rating: number; review_count: number } | null, user: null as { id: string } | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, roles: [], profile: null }) }));
vi.mock("@/components/PageHeader", () => ({ default: () => <header>פרטי משימה</header> }));
vi.mock("@/components/tasks/TaskLocationMap", () => ({ default: () => <div data-testid="map">מפה</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{first_name: "מפרסם", last_name: "בדיקה"}] }),
  from: (table: string) => {
    const query = { select: () => query, eq: () => query, is: () => query, in: () => query, order: () => query,
      range: async () => ({ data: table === "user_role_ratings" && state.rating ? [{ user_id: "publisher", ...state.rating }] : [], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({data: {
        id: "task", name: "משימת בדיקה", short_desc: "התיאור הקצר המקורי", full_desc: state.fullDescription,
        notes: state.notes, creator_id: "publisher", category: "other", payment: 100,
        payment_type: "task", status: "open", workers_needed: 1, location: "מיקום בדיקה", views_count: 0,
      }, error: null}),
    }; return query;
  },
} }));
afterEach(() => { cleanup(); state.user = null; });
const task = (entry: string | { pathname: string; state: unknown } = "/task/task") => render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/task/:id" element={<TaskDetail />} /></Routes></MemoryRouter>);
it("shows the publisher's full explanation and notes before location details", async () => {
  task();
  // The redesign shows the explanation twice: in the summary card and in its own card.
  const description = (await screen.findAllByText(/הסבר מפורט של מפרסם המשימה/)).at(-1)!;
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

it("shows the publisher's approved rating before applying", async () => {
  state.rating = { avg_rating: 4.8, review_count: 12 };
  task();
  expect((await screen.findByText("4.8")).parentElement).toHaveTextContent("12 דירוגים");
});
it("shows when the publisher has no ratings", async () => {
  state.rating = null;
  task();
  expect(await screen.findByText("עדיין אין דירוגים")).toBeInTheDocument();
});

it("opens the edit dialog for the owner who followed the edit link, and only once", async () => {
  state.user = { id: "publisher" };
  task({ pathname: "/task/task", state: { openEdit: true } });
  expect(await screen.findByRole("dialog", { name: "עריכת מטלה" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /close|סגירה/i }));
  expect(screen.queryByRole("dialog", { name: "עריכת מטלה" })).not.toBeInTheDocument();
});
