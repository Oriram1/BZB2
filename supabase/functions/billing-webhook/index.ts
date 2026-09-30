/**
 * Cardcom's server-to-server notification for a hosted-page payment.
 *
 * verify_jwt is off because Cardcom sends no JWT, and the published API has no
 * signature for this callback, so nothing in the request can be trusted. The only thing
 * read from it is the LowProfileId, used to find OUR pending order; what
 * actually happened is then asked of Cardcom directly (GetLpResult) and checked
 * against our own record of the order. A forged request can trigger a lookup,
 * never a paid subscription.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { readJsonObject } from "../_shared/auth.ts";
import { settleLowProfileOrder, type OrderRow } from "../_shared/billing.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Cardcom posts JSON; a form body is accepted too rather than losing a payment. */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text();
    if (raw.length > 32_768) throw new Error("payload_too_large");
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return await readJsonObject(req);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown>;
  try {
    body = await readBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_json";
    return json({ error: message }, message === "payload_too_large" ? 413 : 400);
  }

  const lowProfileId = String(body.LowProfileId ?? body.lowprofilecode ?? "").trim();
  if (!lowProfileId || lowProfileId.length > 100) return json({ error: "missing_low_profile_id" }, 400);

  const { data: order } = await admin
    .from("payment_orders")
    .select("id, user_id, plan_id, kind, amount, status, low_profile_id, external_uniq_id, deal_number")
    .eq("low_profile_id", lowProfileId)
    .maybeSingle();

  // Unknown page id: acknowledge so Cardcom stops retrying, keep a trace.
  if (!order) {
    await admin.from("payment_events").insert({ source: "webhook", low_profile_id: lowProfileId, outcome: "unknown_order" });
    return json({ ok: true });
  }

  try {
    const { status } = await settleLowProfileOrder(admin, order as OrderRow);
    await admin.from("payment_events").insert({
      source: "webhook",
      low_profile_id: lowProfileId,
      order_id: order.id,
      outcome: status,
      // The claimed values, kept only to compare against what Cardcom confirms.
      payload: { ResponseCode: body.ResponseCode ?? null, ReturnValue: body.ReturnValue ?? null },
    });
    return json({ ok: true, status });
  } catch (error) {
    // Transient failure (Cardcom unreachable, DB error): answer 5xx so Cardcom
    // delivers again, and the return-page confirm can also pick it up.
    console.error("billing_webhook_failed", error instanceof Error ? error.message : error);
    return json({ error: "temporarily_unavailable" }, 500);
  }
});
