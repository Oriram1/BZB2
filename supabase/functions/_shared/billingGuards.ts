/**
 * Early exits shared by the billing endpoints. Each returns the `Response` to
 * send, or lets the handler go on.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import { hasRole, json } from "./auth.ts";
import { loadPlan, type Plan } from "./billing.ts";
import { billingEnabled } from "./cardcom.ts";
import { PlanIntegrityError } from "./planPrice.ts";

/** 503 while billing is switched off; 403 when `role` is given and the caller lacks it. */
export async function billingGate(admin: SupabaseClient, userId: string, role?: "tasker"): Promise<Response | null> {
  if (!billingEnabled()) return json({ error: "billing_disabled" }, 503);
  if (role && !(await hasRole(admin, userId, role))) return json({ error: `${role}_only` }, 403);
  return null;
}

/**
 * The verified plan to charge from, or the reply for why there is none: a
 * price that does not carry a valid signature is never charged. A plan being
 * bought must be active; one a customer already holds may have been retired.
 */
export async function loadPlanOrReply(
  admin: SupabaseClient,
  planId: string,
  options: { activeOnly?: boolean } = {},
): Promise<{ plan: Plan; reply?: undefined } | { plan?: undefined; reply: Response }> {
  let plan: Plan | null;
  try {
    plan = await loadPlan(admin, planId);
  } catch (error) {
    if (error instanceof PlanIntegrityError) return { reply: json({ error: "price_integrity_error" }, 503) };
    throw error;
  }
  if (!plan || (options.activeOnly !== false && !plan.active)) return { reply: json({ error: "unknown_plan" }, 400) };
  return { plan };
}
