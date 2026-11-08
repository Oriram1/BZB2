const GOOGLE_IDENTITY_URL = "https://accounts.google.com/gsi/client";
let pending: Promise<void> | null = null;

/** Load Google Identity only on screens that show its sign-in button. */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (pending) return pending;

  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_URL;
    script.async = true;
    const timer = window.setTimeout(() => fail(), 10_000);
    const cleanup = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(new Error("Google לא נטען. כדאי לנסות שוב."));
    };
    script.onload = () => {
      if (!window.google?.accounts?.id) { fail(); return; }
      cleanup();
      resolve();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
