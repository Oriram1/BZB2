/** Reserve the window during the click, before any network request can lose user activation. */
export const PAYMENT_POPUP_BLOCKED = "הדפדפן חסם את פתיחת דף התשלום. יש לאפשר חלונות קופצים לאתר ולנסות שוב.";
export const PAYMENT_TAB_OPENED = "דף התשלום נפתח בכרטיסייה נפרדת. אפשר לחזור לכאן בסיום.";

export function openPaymentTab() {
  const tab = window.open("", "_blank");
  if (!tab) return null;
  tab.opener = null;
  tab.document.title = "BZB - פתיחת תשלום מאובטח";
  tab.document.documentElement.lang = "he";
  tab.document.documentElement.dir = "rtl";
  const main = tab.document.createElement("main");
  main.style.cssText = "max-width:480px;margin:80px auto;padding:24px;text-align:center;font-family:Arial,sans-serif;color:#20221b;background:#fff9ee;border-radius:24px";
  const logo = tab.document.createElement("img");
  logo.src = `${window.location.origin}/bzb-logo.png`;
  logo.alt = "BZB";
  logo.width = 96;
  const heading = tab.document.createElement("h1");
  heading.textContent = "פותחים דף תשלום מאובטח";
  const note = tab.document.createElement("p");
  note.textContent = "המסך המקורי נשאר פתוח. בסיום אפשר לחזור אליו.";
  main.append(logo, heading, note);
  tab.document.body.append(main);
  return {
    close: () => tab.close(),
    navigate: (url: string) => {
      if (tab.closed) return false;
      let target: URL;
      try { target = new URL(url); }
      catch { tab.close(); return false; }
      if (target.protocol !== "https:" && !(target.origin === window.location.origin && ["localhost", "127.0.0.1"].includes(target.hostname))) {
        tab.close();
        return false;
      }
      tab.location.replace(target.href);
      return true;
    },
  };
}

export type PaymentTab = NonNullable<ReturnType<typeof openPaymentTab>>;
