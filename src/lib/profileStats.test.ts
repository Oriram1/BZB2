import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBeeStats, loadPublishedTaskCounts } from "./profileStats";

const { pages, calls } = vi.hoisted(() => ({ pages: [] as unknown[], calls: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async () => pages.shift(),
        is: () => { calls.push("archive filter"); return query; },
      };
      return query;
    },
  },
}));
const application = (id: string, status: string, payment: number, taskStatus = "completed", paymentType = "task", hours: number | null = null) => ({
  id, task_id: id, status,
  tasks: { status: taskStatus, payment, payment_type: paymentType, duration_hours: hours },
});

beforeEach(() => { pages.length = 0; calls.length = 0; });
describe("lifetime worker statistics", () => {
  it("counts only accepted completed work; hourly earnings use duration", async () => {
    pages.push({ data: [
      application("fixed", "accepted", 100),
      application("hourly", "accepted", 40, "completed", "hour", 2.5),
      application("open", "accepted", 999, "open"),
      application("cancelled", "accepted", 999, "cancelled"),
      application("pending", "pending", 999),
      application("rejected", "rejected", 999),
    ], error: null });
    expect(await loadBeeStats("worker")).toEqual({ applied: 6, accepted: 4, completed: 2, totalEarnings: 200, estimatedEarnings: true, missingHours: false });
    expect(calls).toEqual([]);
  });
  it("does not mistake an hourly rate without hours for an earned amount", async () => {
    pages.push({ data: [application("unknown", "accepted", 50, "completed", "hour")], error: null });
    expect(await loadBeeStats("worker")).toMatchObject({ completed: 1, totalEarnings: 0, missingHours: true });
  });
  it("keeps archived history and reads beyond the server row cap", async () => {
    pages.push({ data: Array.from({ length: 1000 }, (_, i) => ({ ...application(String(i), "accepted", 1), archived_at: "2026-01-01" })), error: null });
    pages.push({ data: [application("last", "accepted", 25)], error: null });
    expect(await loadBeeStats("worker")).toMatchObject({ applied: 1001, completed: 1001, totalEarnings: 1025 });
    expect(calls).toEqual([]);
  });
  it("surfaces failed reads instead of reporting zero earnings", async () => {
    pages.push({ data: null, error: { message: "network failure" } });
    await expect(loadBeeStats("worker")).rejects.toEqual({ message: "network failure" });
  });
  it("does not silently report zero for inaccessible accepted tasks", async () => {
    pages.push({ data: [{ ...application("hidden", "accepted", 1), tasks: null }], error: null });
    await expect(loadBeeStats("worker")).rejects.toThrow("accepted_task_not_readable");
  });
});

it("keeps completed publisher history while hiding archived open work from active totals", async () => {
  pages.push({ data: [
    { status: "completed", archived_at: "2026-01-01" },
    { status: "open", archived_at: "2026-01-01" },
    { status: "open", archived_at: null },
    { status: "cancelled", archived_at: null },
  ], error: null });
  expect(await loadPublishedTaskCounts("publisher")).toEqual({ total: 4, open: 1, inProgress: 0, completed: 1, cancelled: 1 });
});
