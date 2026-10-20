import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PublicProfile from "./PublicProfile";

const state = vi.hoisted(() => ({ reviews: [] as Array<{id: string; rating: number; body: string; created_at: string; reviewer_id: string}>, failed: false, approvedOnly: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/PageHeader", () => ({ default: () => <header>פרופיל</header> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{ user_id: "worker", first_name: "שם", last_name: "בדיקה", gender: null, avatar_url: null, created_at: "2026-01-01" }] }),
  from: (table: string) => {
    const result = () => table === "reviews" ? { data: state.reviews, error: state.failed ? {message: "offline"} : null } : { data: [], error: null };
    const query = { select: () => query, eq: (key: string, value: string) => { if (key === "status" && value === "approved") state.approvedOnly = true; return query; }, is: () => query, order: () => query, range: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    return query;
  },
} }));
afterEach(() => { cleanup(); state.reviews = []; state.failed = false; state.approvedOnly = false; });
const profile = () => render(<MemoryRouter initialEntries={["/profile/worker"]}><Routes><Route path="/profile/:userId" element={<PublicProfile />} /></Routes></MemoryRouter>);
it("keeps a rating section visible before the first review", async () => {
  profile();
  expect(await screen.findByRole("heading", {name: "דירוג וביקורות"})).toBeInTheDocument();
  expect(screen.getByText(/אין עדיין דירוגים/)).toBeInTheDocument();
});
it("shows approved reviews and their average", async () => {
  state.reviews = [4, 5].map((rating, index) => ({id: String(index), rating, body: `ביקורת ${index}`, created_at: "2026-01-01", reviewer_id: "reviewer"}));
  profile();
  expect(await screen.findByText("4.5")).toBeInTheDocument();
  expect(screen.getByText("(2)")).toBeInTheDocument();
  expect(screen.getByText("ביקורת 0")).toBeInTheDocument();
  expect(state.approvedOnly).toBe(true);
});
it("distinguishes a failed rating query from no reviews", async () => {
  state.failed = true;
  profile();
  expect(await screen.findByRole("alert")).toHaveTextContent("לא הצלחנו לטעון את הדירוגים");
  expect(screen.queryByText(/אין עדיין דירוגים/)).not.toBeInTheDocument();
});
