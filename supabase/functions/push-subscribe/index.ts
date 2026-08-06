/** Registers or removes a browser's Web Push subscription for the caller. */
import { authenticatedClients, withCors, errorResponse, json } from "../_shared/auth.ts";

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { user, admin } = await authenticatedClients(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "subscribe");
    const endpoint = String(body.subscription?.endpoint ?? "");

    if (!endpoint) return json({ error: "missing_endpoint" }, 400);

    if (action === "unsubscribe") {
      await admin
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint)
        .eq("user_id", user.id);
      return json({ ok: true });
    }

    const p256dh = String(body.subscription?.keys?.p256dh ?? "");
    const auth = String(body.subscription?.keys?.auth ?? "");
    if (!p256dh || !auth) return json({ error: "missing_keys" }, 400);

    // Endpoint is unique: re-subscribing on the same device refreshes the row
    // instead of piling up duplicates, and reassigns it if the account changed.
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) return json({ error: "subscribe_failed" }, 500);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}));
