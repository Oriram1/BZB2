import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CONSENT_CHANGED } from "@/lib/performanceConsent";

const captured = vi.hoisted(() => ({ filter: undefined as undefined | ((event: { type: "vital"; url: string; route?: string }) => unknown) }));
vi.mock("@vercel/speed-insights/react", () => ({
  SpeedInsights: ({ beforeSend }: { beforeSend: typeof captured.filter }) => {
    captured.filter = beforeSend;
    return <span>metrics loaded</span>;
  },
}));

beforeEach(() => { vi.stubEnv("VITE_ENABLE_SPEED_INSIGHTS", "true"); captured.filter = undefined; localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });

it("stays disabled without the deployment flag even after consent", async () => {
  vi.stubEnv("VITE_ENABLE_SPEED_INSIGHTS", "false");
  localStorage.setItem("bzb_cookie_consent", "all");
  const { default: PerformanceInsights } = await import("./PerformanceInsights");
  render(<MemoryRouter initialEntries={["/"]}><PerformanceInsights /></MemoryRouter>);
  expect(screen.queryByText("metrics loaded")).toBeNull();
});

it("waits for explicit consent before loading metrics", async () => {
  const { default: PerformanceInsights } = await import("./PerformanceInsights");
  render(<MemoryRouter initialEntries={["/"]}><PerformanceInsights /></MemoryRouter>);
  expect(screen.queryByText("metrics loaded")).toBeNull();
  localStorage.setItem("bzb_cookie_consent", "all");
  window.dispatchEvent(new Event(CONSENT_CHANGED));
  expect(await screen.findByText("metrics loaded")).toBeInTheDocument();
  localStorage.setItem("bzb_cookie_consent", "essential");
  window.dispatchEvent(new Event(CONSENT_CHANGED));
  await waitFor(() => expect(screen.queryByText("metrics loaded")).toBeNull());
});

it("does not load on token-bearing routes and filters sensitive event URLs", async () => {
  const { default: PerformanceInsights } = await import("./PerformanceInsights");
  localStorage.setItem("bzb_cookie_consent", "all");
  const blocked = render(<MemoryRouter initialEntries={["/parent/view/private-token"]}><PerformanceInsights /></MemoryRouter>);
  expect(screen.queryByText("metrics loaded")).toBeNull();
  blocked.unmount();
  render(<MemoryRouter initialEntries={["/"]}><PerformanceInsights /></MemoryRouter>);
  await screen.findByText("metrics loaded");
  expect(captured.filter?.({ type: "vital", url: "/tasks?token=private" })).toBeNull();
  expect(captured.filter?.({ type: "vital", url: "/parent/view/private-token" })).toBeNull();
  expect(captured.filter?.({ type: "vital", url: "/tasks" })).toEqual({ type: "vital", url: "/tasks", route: "/tasks" });
  localStorage.setItem("bzb_cookie_consent", "essential");
  expect(captured.filter?.({ type: "vital", url: "/tasks" })).toBeNull();
});
