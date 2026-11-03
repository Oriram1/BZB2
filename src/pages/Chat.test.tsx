import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Chat from "./Chat";

const state = vi.hoisted(() => ({
  user: { id: "me" },
  markRead: () => {},
  completed: false,
  taskChanged: undefined as (() => void) | undefined,
  messageReads: [] as string[],
  reviewed: [] as { task_id: string; reviewee_id: string }[],
  creator: "other",
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/hooks/useNotifications", () => ({ useNotifications: () => ({ markConversationNotificationsRead: state.markRead }) }));
vi.mock("@/hooks/useViewportHeight", () => ({ useViewportHeight: () => {} }));
vi.mock("@/components/PageHeader", () => ({ default: () => <header>שיחות</header> }));
vi.mock("@/components/chat/ChatComposer", () => ({ default: () => <div data-testid="composer">כתיבת הודעה</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: vi.fn(async () => ({ error: null })),
  removeChannel: vi.fn(),
  channel: () => {
    const channel = { on: (_event: string, filter: {table: string}, callback: () => void) => {
      if (filter.table === "tasks") state.taskChanged = callback;
      return channel;
    }, subscribe: () => channel };
    return channel;
  },
  from: (table: string) => {
    let id = "";
    const result = () => {
      if (table === "conversations") return { data: [
        { id: "open-chat", task_id: "open-task", participant_1: "me", participant_2: "other" },
        { id: "closed-chat", task_id: "closed-task", participant_1: "me", participant_2: "other" },
      ], error: null };
      if (table === "tasks") return { data: { name: id === "open-task" ? "משימה פעילה" : "משימה שהסתיימה", status: id === "closed-task" || state.completed ? "completed" : "open", archived_at: null, creator_id: state.creator }, error: null };
      if (table === "reviews") return { data: state.reviewed, error: null };
      if (table === "profiles") return { data: { first_name: "שותף", last_name: "למשימה", phone: null }, error: null };
      if (table === "messages") { state.messageReads.push(id); return { data: [], count: 0, error: null }; }
      throw new Error(table);
    };
    const query = {
      select: () => query, or: () => query, order: () => query,
      eq: (_key: string, value: string) => { id = value; return query; },
      neq: () => query, limit: () => query,
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  },
} }));

beforeEach(() => {
  state.completed = false; state.taskChanged = undefined; state.messageReads = [];
  state.reviewed = []; state.creator = "other";
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const ratingList = () => screen.queryByRole("region", { name: "מטלות שהושלמו וממתינות לדירוג" });

it("hides completed conversations even when opened through a direct link", async () => {
  render(<MemoryRouter initialEntries={["/chat?conversation=closed-chat"]}><Chat /></MemoryRouter>);
  await screen.findByText("משימה פעילה");
  expect(screen.queryByTestId("composer")).not.toBeInTheDocument();
  expect(state.messageReads).not.toContain("closed-chat");
  // The finished task stays only as a rating prompt, not as a chat.
  expect(ratingList()).toHaveTextContent("משימה שהסתיימה");
});
it("closes an already-open conversation when the task completes", async () => {
  render(<MemoryRouter initialEntries={["/chat?conversation=open-chat"]}><Chat /></MemoryRouter>);
  await screen.findByTestId("composer");
  await act(async () => { state.completed = true; state.taskChanged?.(); });
  await waitFor(() => expect(screen.queryByTestId("composer")).not.toBeInTheDocument());
  expect(ratingList()).toHaveTextContent("משימה פעילה");
});
it("drops a finished task from the rating list once it was rated", async () => {
  state.reviewed = [{ task_id: "closed-task", reviewee_id: "other" }];
  render(<MemoryRouter initialEntries={["/chat"]}><Chat /></MemoryRouter>);
  await screen.findByText("משימה פעילה");
  expect(ratingList()).not.toBeInTheDocument();
});
it("offers completion only to the task's publisher", async () => {
  render(<MemoryRouter initialEntries={["/chat?conversation=open-chat"]}><Chat /></MemoryRouter>);
  await screen.findByTestId("composer");
  expect(screen.queryByRole("button", { name: "הושלמה" })).not.toBeInTheDocument();
  cleanup();
  state.creator = "me";
  render(<MemoryRouter initialEntries={["/chat?conversation=open-chat"]}><Chat /></MemoryRouter>);
  await screen.findByTestId("composer");
  expect(screen.getByRole("button", { name: "הושלמה" })).toBeInTheDocument();
});
