/**
 * Sets the price of a subscription plan. Admin only.
 *
 * The browser sends `{ plan_id, amount }`. This function re-checks that the
 * caller is an admin (the role is read with the service key, not trusted from
 * the request), bounds the value, signs (id, amount, period) with the key that
 * only the Edge Function environment holds, and applies it through
 * `admin_set_plan_price`, which is callable by the service role alone. Billing
 * refuses to charge a plan whose signature does not match, so this is the only
 * path that produces a chargeable price.
 *
 * `{ plan_id, resign: true }` re-signs the current amount, for the first
 * rollout and after a rotation of the signing key.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { json, readJsonObject, withCors } from "../_shared/auth.ts";
import { signPlan } from "../_shared/planPrice.ts";

const MIN_AMOUNT = 0.1;
const MAX_AMOUNT = 1000;

Deno.serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "unauthorized" }, 401);
    const adminUserId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await readJsonObject(req);
    const planId = String(body.plan_id ?? "").trim();
    const resign = body.resign === true;

    const { data: plan } = await admin
      .from("billing_plans")
      .select("id, amount, period_months")
      .eq("id", planId)
      .maybeSingle();
    if (!plan) return json({ error: "unknown_plan" }, 404);

    let amount: number;
    if (resign) {
      amount = Number(plan.amount);
    } else {
      amount = typeof body.amount === "number" ? body.amount : Number.NaN;
      if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
        return json({ error: "invalid_amount", min: MIN_AMOUNT, max: MAX_AMOUNT }, 400);
      }
      // Whole agorot only: 29.9 and 29.90 are fine, 29.999 is not.
      if (Math.round(amount * 100) / 100 !== amount) return json({ error: "invalid_amount" }, 400);
    }

    const signature = await signPlan({ id: plan.id, amount, period_months: plan.period_months });
    const { data: result, error } = await admin.rpc("admin_set_plan_price", {
      _plan_id: plan.id,
      _amount: amount,
      _signature: signature,
      _actor: adminUserId,
    });
    if (error) {
      console.error("admin_set_plan_price_failed", error.message);
      await admin.from("admin_audit_log").insert({
        admin_user_id: adminUserId,
        action: resign ? "resign_plan_price" : "set_plan_price",
        target_identifier: plan.id,
        success: false,
        details: { error: error.message },
      });
      return json({ error: "update_failed" }, 500);
    }

    await admin.from("admin_audit_log").insert({
      admin_user_id: adminUserId,
      action: resign ? "resign_plan_price" : "set_plan_price",
      target_identifier: plan.id,
      success: true,
      details: result,
    });

    return json({ ok: true, ...(result as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof Error && error.message === "price_signing_not_configured") {
      console.error("price_signing_not_configured");
      return json({ error: "signing_not_configured" }, 503);
    }
    console.error("admin_set_plan_price_unhandled", error);
    return json({ error: "internal_error" }, 500);
  }
}));
