import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** True once the app runs from the home screen rather than a browser tab. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Push is offered to installed apps only.
 *
 * iOS enforces this anyway — Safari exposes PushManager to home-screen
 * installs alone — and we apply the same rule everywhere else on purpose: a
 * permission prompt fired from a throwaway browser tab is the classic way to
 * get denied permanently, and once denied the browser will not ask again.
 */
export function needsInstall() {
  return !isStandalone();
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: "not_configured" };
  // Guarded here as well as in the UI: the permission prompt must never fire
  // from a browser tab, whatever calls this.
  if (needsInstall()) return { ok: false, reason: "install_required" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
  if (!registration) return { ok: false, reason: "no_service_worker" };
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const { error } = await supabase.functions.invoke("push-subscribe", {
    body: { action: "subscribe", subscription: subscription.toJSON() },
  });

  if (error) return { ok: false, reason: "save_failed" };
  return { ok: true };
}

export async function unsubscribeFromPush() {
  const subscription = await currentSubscription();
  if (!subscription) return { ok: true };

  await supabase.functions.invoke("push-subscribe", {
    body: { action: "unsubscribe", subscription: subscription.toJSON() },
  });
  await subscription.unsubscribe();
  return { ok: true };
}
