import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useViewportHeight } from "./useViewportHeight";

/**
 * The numbers here are not invented: they were read off an iPhone 16e (iOS 26,
 * Safari) with the chat composer focused. Opening the keyboard shrank
 * window.innerHeight from 699 to 380 — the same amount the visual viewport
 * shrank — and iOS scrolled the document down by 319px to reveal the field.
 * Together those two facts hid the composer above the top of the screen.
 */
const PORTRAIT_HEIGHT = 699;
const KEYBOARD_HEIGHT = 380;
const KEYBOARD_SCROLL = 319;

type FakeViewport = EventTarget & { width: number; height: number; offsetTop: number };

const viewport = new EventTarget() as FakeViewport;

const setViewport = (height: number, offsetTop = 0, width = 390) => {
  viewport.height = height;
  viewport.offsetTop = offsetTop;
  viewport.width = width;
  // iOS shrinks the layout viewport along with the visual one; that is exactly
  // what made the old innerHeight-vs-visualViewport comparison miss the keyboard.
  window.innerHeight = height;
  window.innerWidth = width;
  act(() => {
    viewport.dispatchEvent(new Event("resize"));
  });
};

const root = () => document.documentElement;
const cssVar = (name: string) => root().style.getPropertyValue(name);

beforeEach(() => {
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  viewport.height = PORTRAIT_HEIGHT;
  viewport.offsetTop = 0;
  viewport.width = 390;
  window.innerHeight = PORTRAIT_HEIGHT;
  window.innerWidth = 390;
});

describe("useViewportHeight", () => {
  it("reports no keyboard at rest", () => {
    renderHook(() => useViewportHeight());

    expect(cssVar("--app-height")).toBe(`${PORTRAIT_HEIGHT}px`);
    expect(cssVar("--app-offset")).toBe("0px");
    expect(root().dataset.keyboard).toBe("closed");
  });

  it("detects the keyboard even when the layout viewport shrinks with it", () => {
    renderHook(() => useViewportHeight());

    setViewport(KEYBOARD_HEIGHT, KEYBOARD_SCROLL);

    // innerHeight - visualViewport.height is 0 here; only the tallest-seen
    // baseline can tell that 380px of screen went missing.
    expect(root().dataset.keyboard).toBe("open");
    expect(cssVar("--app-height")).toBe(`${KEYBOARD_HEIGHT}px`);
  });

  it("mirrors the scroll iOS applies, so the screen can pin itself to the visible area", () => {
    renderHook(() => useViewportHeight());

    setViewport(KEYBOARD_HEIGHT, KEYBOARD_SCROLL);

    expect(cssVar("--app-offset")).toBe(`${KEYBOARD_SCROLL}px`);
  });

  it("returns to a full screen when the keyboard closes", () => {
    renderHook(() => useViewportHeight());

    setViewport(KEYBOARD_HEIGHT, KEYBOARD_SCROLL);
    setViewport(PORTRAIT_HEIGHT, 0);

    expect(root().dataset.keyboard).toBe("closed");
    expect(cssVar("--app-height")).toBe(`${PORTRAIT_HEIGHT}px`);
    expect(cssVar("--app-offset")).toBe("0px");
  });

  it("does not mistake a rotation for a keyboard", () => {
    renderHook(() => useViewportHeight());

    // Landscape is far shorter than the portrait height seen a moment ago.
    setViewport(390, 0, PORTRAIT_HEIGHT);

    expect(root().dataset.keyboard).toBe("closed");
  });

  it("still detects the keyboard after a rotation", () => {
    renderHook(() => useViewportHeight());

    setViewport(390, 0, PORTRAIT_HEIGHT);
    setViewport(150, 120, PORTRAIT_HEIGHT);

    expect(root().dataset.keyboard).toBe("open");
  });

  it("cleans up the variables it set when the screen unmounts", () => {
    const { unmount } = renderHook(() => useViewportHeight());

    unmount();

    expect(cssVar("--app-height")).toBe("");
    expect(cssVar("--app-offset")).toBe("");
    expect(root().dataset.keyboard).toBeUndefined();
  });
});
