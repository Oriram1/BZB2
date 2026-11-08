import { afterEach, expect, it, vi } from "vitest";
import { loadGoogleIdentity } from "./loadGoogleIdentity";

const script = () => document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')!;
afterEach(() => {
  document.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]').forEach((item) => item.remove());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shares a pending load and resolves after Google becomes available", async () => {
  const first = loadGoogleIdentity();
  const second = loadGoogleIdentity();
  expect(document.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')).toHaveLength(1);
  vi.stubGlobal("google", { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } });
  script().dispatchEvent(new Event("load"));
  await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
});

it("reports a load failure and allows a later attempt", async () => {
  vi.resetModules();
  const { loadGoogleIdentity: load } = await import("./loadGoogleIdentity");
  const first = load();
  script().dispatchEvent(new Event("error"));
  await expect(first).rejects.toThrow("Google לא נטען");
  expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).toBeNull();
  const retry = load();
  vi.stubGlobal("google", { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } } });
  script().dispatchEvent(new Event("load"));
  await expect(retry).resolves.toBeUndefined();
});
