import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PushOnboarding from "./PushOnboarding";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), subscribe: vi.fn(), user: { id: "user-1" }, standalone: true }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/lib/push", () => ({
  isStandalone: () => mocks.standalone, pushConfigured: () => true, pushSupported: () => true,
  syncPushSubscription: mocks.sync, subscribeToPush: mocks.subscribe,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  sessionStorage.clear();
  mocks.standalone = true;
  mocks.sync.mockReset().mockResolvedValue(false);
  mocks.subscribe.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("Notification", { permission: "default" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("asks in the installed app and subscribes only after a click", async () => {
  render(<PushOnboarding />);
  await screen.findByText(/שנעדכן כשיש חדש/);
  expect(mocks.subscribe).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "כן, לעדכן אותי" }));
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByText(/שנעדכן כשיש חדש/)).not.toBeInTheDocument());
});

it("reconnects an existing subscription without prompting", async () => {
  mocks.sync.mockResolvedValue(true);
  render(<PushOnboarding />);
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
  expect(screen.queryByText(/שנעדכן כשיש חדש/)).not.toBeInTheDocument();
});

it("does not prompt in a browser tab", () => {
  mocks.standalone = false;
  render(<PushOnboarding />);
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(screen.queryByText(/שנעדכן כשיש חדש/)).not.toBeInTheDocument();
});

it("explains blocked permission instead of requesting it again", async () => {
  vi.stubGlobal("Notification", { permission: "denied" });
  render(<PushOnboarding />);
  await screen.findByText("ההתראות כבויות במכשיר");
  expect(screen.queryByRole("button", { name: "כן, לעדכן אותי" })).not.toBeInTheDocument();
  expect(mocks.subscribe).not.toHaveBeenCalled();
});
