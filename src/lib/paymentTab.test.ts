import { afterEach, expect, it, vi } from "vitest";
import { openPaymentTab } from "./paymentTab";

afterEach(() => vi.restoreAllMocks());
const fakeTab = () => ({ opener: window, document: document.implementation.createHTMLDocument(), closed: false, close: vi.fn(), location: { replace: vi.fn() } });
it("handles a blocked popup before creating a payment", () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  expect(openPaymentTab()).toBeNull();
});
it("keeps the original page open and disconnects the payment window's opener", () => {
  const tab = fakeTab();
  const original = window.location.href;
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  const payment = openPaymentTab()!;
  expect(tab.opener).toBeNull();
  expect(tab.document.body.textContent).toContain("פותחים דף תשלום מאובטח");
  expect(payment.navigate("https://secure.cardcom.solutions/pay/test")).toBe(true);
  expect(tab.location.replace).toHaveBeenCalledWith("https://secure.cardcom.solutions/pay/test");
  expect(window.location.href).toBe(original);
});
it("rejects an unsafe payment URL and closes the empty window", () => {
  const tab = fakeTab();
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  expect(openPaymentTab()!.navigate("javascript:alert(1)")).toBe(false);
  expect(tab.close).toHaveBeenCalled();
  expect(tab.location.replace).not.toHaveBeenCalled();
});
