import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DelayedFallback } from "@/components/DelayedFallback";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

describe("DelayedFallback", () => {
  it("shows nothing for a fast load and the placeholder after the delay", () => {
    vi.useFakeTimers();
    render(<DelayedFallback delayMs={300}><p>skeleton</p></DelayedFallback>);
    expect(screen.queryByText("skeleton")).toBeNull();
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.queryByText("skeleton")).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByText("skeleton")).toBeTruthy();
    vi.useRealTimers();
  });
});

function touch(el: Element, type: string, y: number, stamp = 0) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "touches", { value: [{ clientY: y }] });
  Object.defineProperty(event, "timeStamp", { value: stamp });
  act(() => { el.dispatchEvent(event); });
}

describe("swipe to close dialog", () => {
  const setup = () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>t</DialogTitle>
          <DialogDescription>d</DialogDescription>
          <input aria-label="field" />
        </DialogContent>
      </Dialog>,
    );
    return { onOpenChange, content: screen.getByRole("dialog") };
  };

  it("closes on a long pull down", () => {
    const { onOpenChange, content } = setup();
    touch(content, "touchstart", 100);
    touch(content, "touchmove", 260, 300);
    touch(content, "touchend", 260, 300);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open on a short slow pull and on a drag that starts in a field", () => {
    const { onOpenChange, content } = setup();
    touch(content, "touchstart", 100);
    touch(content, "touchmove", 130, 900);
    touch(content, "touchend", 130, 900);
    const field = screen.getByLabelText("field");
    touch(field, "touchstart", 100);
    touch(field, "touchmove", 400, 200);
    touch(field, "touchend", 400, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps the visible close button", () => {
    setup();
    expect(screen.getByLabelText("סגירה")).toBeTruthy();
  });
});

describe("idempotent task creation", () => {
  it("sends one request id per attempt and a unique index backs it", () => {
    const page = read("src/pages/CreateTask.tsx");
    expect(page).toContain("client_request_id: requestIdRef.current");
    expect(page).toContain('insertError?.code === "23505"');
    const sql = read("supabase/migrations/20261114100000_task_client_request_id.sql");
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*\(creator_id, client_request_id\)/);
  });
});

describe("thumbhash previews", () => {
  it("turns a hash into a data URL and ignores a missing or broken hash", async () => {
    const { rgbaToThumbHash } = await import("thumbhash");
    const { thumbHashToUrl } = await import("@/lib/thumbhash");
    const rgba = new Uint8Array(4 * 4 * 4).fill(180);
    const hash = btoa(String.fromCharCode(...rgbaToThumbHash(4, 4, rgba)));
    expect(hash.length).toBeLessThanOrEqual(128);
    expect(thumbHashToUrl(hash)).toMatch(/^data:image\/png;base64,/);
    expect(thumbHashToUrl(null)).toBeUndefined();
    expect(thumbHashToUrl("%%%not-base64")).toBeUndefined();
  });
});
