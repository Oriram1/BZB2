/**
 * The free month. The card is saved on Cardcom's page without charging, the
 * subscription starts today, and the first charge is made by the renewal worker
 * when the month ends. One free month per user, ever (decided in SQL).
 */
import { authenticatedClients, json, readJsonObject, servePost } from "../_shared/auth.ts";
import { siteUrl } from "../_shared/email.ts";
import { createLowProfile } from "../_shared/cardcom.ts";
import { cardCheckAmount } from "../_shared/cardCheck.ts";
import { billingGate, loadPlanOrReply } from "../_shared/billingGuards.ts";
import { TRIAL_DAYS } from "../_shared/billingPolicy.ts";

servePost(async (req) => {
  const { user, admin } = await authenticatedClients(req);
  const gated = await billingGate(admin, user.id, "tasker");
  if (gated) return gated;

  const body = await readJsonObject(req);
  // The customer must know the card will be charged when the month ends.
  if (body.accept_renewal !== true) return json({ error: "consent_required" }, 400);

  const { data: state } = await admin
    .from("billing_user_state")
    .select("free_month_used_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (state?.free_month_used_at) return json({ error: "trial_already_used" }, 409);

  // The same person under another or an already deleted account (email with
  // dots or "+tag", same phone). The card is checked once it has been saved.
  const { data: knownPerson, error: precheckError } = await admin.rpc("trial_precheck", { _user_id: user.id });
  if (precheckError) throw precheckError;
  if (knownPerson === true) return json({ error: "trial_already_used" }, 409);

  const { data: existing } = await admin
    .from("subscriptions")
    .select("status, first_paid_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing && (existing.first_paid_at || ["active", "past_due"].includes(existing.status))) {
    return json({ error: "already_subscribed" }, 409);
  }

  const loaded = await loadPlanOrReply(admin, String(body.plan_id ?? ""));
  if (loaded.reply) return loaded.reply;
  const plan = loaded.plan;

  const id = crypto.randomUUID();
  const { error } = await admin.from("billing_charges").insert({
    id,
    user_id: user.id,
    purpose: "card_setup",
    plan_id: plan.id,
    amount: 0,
    meta: { trial: true, trial_days: TRIAL_DAYS },
  });
  if (error) throw error;

  const base = siteUrl();
  const returnUrl = (result: string) => `${base}/billing/return?charge=${id}&result=${result}`;
  try {
    const page = await createLowProfile({
      amount: 0,
      // The card issuer is asked to authorize a small amount (nothing is
      // captured), so a card that cannot pay is refused before the free month.
      cardCheckAmount: cardCheckAmount(Deno.env.get("CARDCOM_CARD_CHECK_AMOUNT")),
      operation: "CreateTokenOnly",
      returnValue: id,
      productName: `חודש חינם – ${plan.name} (אימות כרטיס בלבד, לא תחויבו)`,
      successUrl: returnUrl("success"),
      failedUrl: returnUrl("failed"),
      cancelUrl: returnUrl("cancel"),
      webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-webhook`,
      email: user.email ?? undefined,
    });
    await admin.from("billing_charges").update({ low_profile_id: page.lowProfileId }).eq("id", id);
    return json({ url: page.url, charge_id: id });
  } catch (pageError) {
    await admin.from("billing_charges").update({ status: "failed", error: "create_failed" }).eq("id", id).eq("status", "pending");
    console.error("billing_trial_page_failed", pageError instanceof Error ? pageError.message : pageError);
    return json({ error: "payment_unavailable" }, 502);
  }
});
