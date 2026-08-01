/**
 * Web Push sender (VAPID).
 *
 * Kept deliberately thin: everything Web-Push-library-specific lives here, so
 * swapping the implementation never touches the dispatcher.
 */
import webpush from "npm:web-push@3.6.7";

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushResult =
  | { ok: true }
  | { ok: false; gone: boolean; error: string };

let configured = false;

/** Returns false when VAPID keys are absent, so callers can skip push cleanly. */
export function pushConfigured() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@bzb.app",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export async function sendPush(
  subscription: StoredSubscription,
  payload: unknown,
): Promise<PushResult> {
  if (!pushConfigured()) return { ok: false, gone: false, error: "push_not_configured" };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    // 404/410 mean the browser dropped the subscription — it must be deleted,
    // otherwise every future send retries a dead endpoint forever.
    return {
      ok: false,
      gone: status === 404 || status === 410,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
