/**
 * Charging for tasks and the other one-off charges (free-month card capture,
 * plan-change difference, 14-day cancellation difference).
 *
 * The same discipline as subscription billing applies: the amount is read from
 * OUR record, a charge row exists before Cardcom is asked, the row's id is the
 * idempotency key, and the money is recorded in SQL (`billing_charge_paid`)
 * exactly once however many paths report it.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";
import {
  cardcomConfig,
  chargeToken,
  getLpResult,
  getTransactionByExternalId,
  expiryMMYY,
  type TransactionInfo,
} from "./cardcom.ts";
import { evaluateLowProfileResult, evaluateTransaction, isHardDecline, notifyBilling, type PaidDetails } from "./billing.ts";
import { isCardCheckSuccess } from "./cardCheck.ts";

export type ChargeRow = {
  id: string;
  user_id: string;
  purpose: "task" | "plan_change" | "cancel_difference" | "card_setup";
  task_id: string | null;
  plan_id: string | null;
  amount: number | string;
  status: "pending" | "paid" | "failed" | "refunded";
  low_profile_id: string | null;
  external_uniq_id: string | null;
  deal_number: number | null;
  meta: Record<string, unknown> | null;
};

export const CHARGE_COLUMNS =
  "id, user_id, purpose, task_id, plan_id, amount, status, low_profile_id, external_uniq_id, deal_number, meta";

/** `c:` + 32 hex = 34 characters, well inside Cardcom's 50. */
export function chargeExternalId(chargeId: string) {
  return `c:${chargeId.replaceAll("-", "")}`;
}

/** `MMYY` expiry → whether the card is past its last valid instant. */
export function cardExpired(expiry: string | null | undefined, now = new Date()) {
  if (!expiry || !/^\d{4}$/.test(expiry)) return false;
  const month = Number(expiry.slice(0, 2));
  const year = 2000 + Number(expiry.slice(2));
  if (month < 1 || month > 12) return false;
  return now.getTime() >= Date.UTC(year, month, 1);
}

export type ChargeOutcome =
  | { status: "paid"; chargeId: string; details: PaidDetails }
  | { status: "failed"; chargeId: string; reason: string; code: number | null; hard: boolean }
  /** Timeout or network error: the money may or may not have moved. */
  | { status: "unknown"; chargeId: string }
  | { status: "skipped"; reason: string };

async function stillInReview(admin: SupabaseClient, taskId: string | null) {
  if (!taskId) return false;
  const { data, error } = await admin.from("tasks").select("publish_state").eq("id", taskId).maybeSingle();
  if (error) throw error;
  return data?.publish_state === "pending_review";
}

async function taskLabel(admin: SupabaseClient, taskId: string | null) {
  if (!taskId) return null;
  const { data } = await admin.from("tasks").select("name").eq("id", taskId).maybeSingle();
  return data?.name ?? null;
}

/** Looks for the charge row of a still-unsettled attempt so a retry reuses its key. */
async function pendingTokenCharge(
  admin: SupabaseClient,
  purpose: ChargeRow["purpose"],
  userId: string,
  taskId: string | null,
  amount: number,
): Promise<ChargeRow | null> {
  let query = admin
    .from("billing_charges")
    .select(CHARGE_COLUMNS)
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .eq("status", "pending")
    .is("low_profile_id", null)
    .not("external_uniq_id", "is", null)
    .eq("amount", amount);
  query = taskId ? query.eq("task_id", taskId) : query.is("task_id", null);
  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as ChargeRow | null) ?? null;
}

/**
 * Charges the user's saved card for one amount. Creates (or reuses) the charge
 * row, calls Cardcom, and returns the verdict WITHOUT touching tasks or
 * subscriptions: the caller decides what a paid or failed charge means.
 */
export async function chargeSavedCard(
  admin: SupabaseClient,
  params: {
    userId: string;
    purpose: ChargeRow["purpose"];
    amount: number;
    taskId?: string | null;
    planId?: string | null;
    description: string;
    meta?: Record<string, unknown>;
  },
): Promise<ChargeOutcome & { charge?: ChargeRow }> {
  const { data: method } = await admin
    .from("payment_methods")
    .select("token, card_expiry")
    .eq("user_id", params.userId)
    .maybeSingle();

  let charge = await pendingTokenCharge(admin, params.purpose, params.userId, params.taskId ?? null, params.amount);
  if (!charge) {
    const id = crypto.randomUUID();
    const inserted = await admin
      .from("billing_charges")
      .insert({
        id,
        user_id: params.userId,
        purpose: params.purpose,
        task_id: params.taskId ?? null,
        plan_id: params.planId ?? null,
        amount: params.amount,
        external_uniq_id: chargeExternalId(id),
        meta: params.meta ?? null,
      })
      .select(CHARGE_COLUMNS)
      .single();
    if (inserted.error) throw inserted.error;
    charge = inserted.data as ChargeRow;
  }

  const fail = async (reason: string, code: number | null): Promise<ChargeOutcome & { charge?: ChargeRow }> => {
    await admin.rpc("billing_charge_failed", { _charge_id: charge!.id, _reason: reason, _code: code });
    return { status: "failed", chargeId: charge!.id, reason, code, hard: isHardDecline(code), charge: charge! };
  };

  if (!method?.token) return await fail("no_payment_method", null);
  if (cardExpired(method.card_expiry)) return await fail("card_expired", null);

  let document;
  if (cardcomConfig().issueDocuments) {
    const { data: profile } = await admin.from("profiles").select("first_name, last_name").eq("user_id", params.userId).maybeSingle();
    const email = (await admin.auth.admin.getUserById(params.userId)).data.user?.email ?? undefined;
    document = {
      Name: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || undefined,
      Email: email,
      IsSendByEmail: Boolean(email),
      ExternalId: charge.id,
      Products: [{ Description: params.description, UnitCost: params.amount, Quantity: 1 }],
    };
  }

  let info: TransactionInfo;
  try {
    info = await chargeToken({
      token: method.token,
      expiryMMYY: method.card_expiry ?? "",
      amount: params.amount,
      externalUniqTranId: charge.external_uniq_id!,
      document,
    });
  } catch (error) {
    console.error("billing_task_charge_unknown", { chargeId: charge.id, error: error instanceof Error ? error.message : error });
    return { status: "unknown", chargeId: charge.id, charge };
  }

  let verdict = evaluateTransaction(info, { amount: params.amount });
  if (verdict.kind === "duplicate") {
    verdict = evaluateTransaction(await getTransactionByExternalId(charge.external_uniq_id!), { amount: params.amount });
  }
  if (verdict.kind === "failed") return await fail(verdict.reason, verdict.code);
  if (verdict.kind !== "paid") return { status: "unknown", chargeId: charge.id, charge };

  return { status: "paid", chargeId: charge.id, charge, details: verdict.details };
}

/**
 * Charges the saved card for a task that an admin approved and settles the
 * result. Safe to call again for the same task: an unsettled attempt keeps its
 * key, so a charge that did reach Cardcom is found again, not repeated.
 */
export async function chargeTask(admin: SupabaseClient, taskId: string): Promise<ChargeOutcome> {
  const { data: task } = await admin
    .from("tasks")
    .select("id, creator_id, name, payment_due, publish_state, payment_mode")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { status: "skipped", reason: "task_not_found" };
  if (!["awaiting_charge", "pending_payment"].includes(task.publish_state)) {
    return { status: "skipped", reason: `state_${task.publish_state}` };
  }
  if (task.payment_mode === "one_time") return { status: "skipped", reason: "one_time_payment_required" };
  const amount = Number(task.payment_due);
  if (!(amount > 0)) return { status: "skipped", reason: "nothing_due" };

  const outcome = await chargeSavedCard(admin, {
    userId: task.creator_id,
    purpose: "task",
    amount,
    taskId: task.id,
    description: `משימה: ${task.name}`,
  });

  if (outcome.status === "paid") {
    const { details } = outcome;
    const { data } = await admin.rpc("billing_charge_paid", {
      _charge_id: outcome.chargeId,
      _deal_number: details.dealNumber,
      _document_number: details.documentNumber,
      _document_url: details.documentUrl,
    });
    if ((data as { applied?: boolean } | null)?.applied) {
      await notifyBilling(admin, task.creator_id, "task_approved", { task_id: task.id, task_name: task.name, amount }, "/my-tasks?tab=published");
    }
    return { status: "paid", chargeId: outcome.chargeId, details };
  }

  if (outcome.status === "failed") {
    await notifyBilling(
      admin,
      task.creator_id,
      "task_payment_failed",
      { task_id: task.id, task_name: task.name, amount, reason: outcome.hard ? "card_declined_hard" : outcome.reason },
      "/my-tasks?tab=published",
    );
  }
  return outcome;
}

/**
 * Settles a hosted-page charge (a card typed into Cardcom's page): either a new
 * card for a waiting task, or a card saved without charging (free month, and a
 * card on file for later task charges).
 */
export async function settleChargePage(
  admin: SupabaseClient,
  charge: ChargeRow,
): Promise<{ status: ChargeRow["status"]; taskId?: string | null; trial?: boolean; cardUpdated?: boolean; awaitingReview?: boolean }> {
  // Already settled (the webhook usually gets there first). Say whether it was a
  // free-month card, so the page the customer lands on describes what happened.
  if (charge.status !== "pending" || !charge.low_profile_id) {
    const awaitingReview = charge.status === "paid" && charge.purpose === "task" && await stillInReview(admin, charge.task_id);
    return { status: charge.status, taskId: charge.task_id, trial: charge.status === "paid" && charge.meta?.trial === true, cardUpdated: charge.status === "paid" && charge.meta?.card_update === true, awaitingReview };
  }

  const result = await getLpResult(charge.low_profile_id);
  const terminal = cardcomConfig().terminal;

  if (result.ReturnValue !== charge.id) {
    await admin.rpc("billing_charge_failed", { _charge_id: charge.id, _reason: "order_mismatch", _code: result.ResponseCode ?? null });
    return { status: "failed", taskId: charge.task_id };
  }
  if (result.TerminalNumber !== undefined && result.TerminalNumber !== terminal) {
    await admin.rpc("billing_charge_failed", { _charge_id: charge.id, _reason: "terminal_mismatch", _code: null });
    return { status: "failed", taskId: charge.task_id };
  }

  const tx = result.TranzactionInfo;

  if (charge.purpose === "card_setup") {
    // 700 and 701 are a successful J2 or J5 card check (see cardCheck.ts).
    if (tx && !isCardCheckSuccess(tx.ResponseCode)) {
      await admin.rpc("billing_charge_failed", {
        _charge_id: charge.id,
        _reason: (tx.Description ?? result.Description ?? "declined").slice(0, 200),
        _code: tx.ResponseCode ?? null,
      });
      return { status: "failed", taskId: charge.task_id };
    }
    const token = result.TokenInfo?.Token ?? tx?.Token ?? null;
    if (!token) return { status: "pending", taskId: charge.task_id };

    const last4 = tx?.Last4CardDigitsString ?? null;
    const expiry = expiryMMYY(result.TokenInfo?.CardMonth ?? tx?.CardMonth, result.TokenInfo?.CardYear ?? tx?.CardYear);
    if (charge.meta?.card_update === true) {
      const { error } = await admin.rpc("complete_subscription_card_update", {
        _charge_id: charge.id, _token: token, _card_last4: last4, _card_expiry: expiry,
      });
      if (error) throw error;
      return { status: "paid", cardUpdated: true };
    }
    const { data: applied } = await admin.rpc("billing_charge_paid", {
      _charge_id: charge.id,
      _deal_number: null,
      _document_number: null,
      _document_url: null,
    });
    if (!(applied as { applied?: boolean } | null)?.applied) {
      return { status: "paid", taskId: charge.task_id, trial: charge.meta?.trial === true };
    }

    await admin.rpc("save_payment_method", {
      _user_id: charge.user_id,
      _token: token,
      _card_last4: last4,
      _card_expiry: expiry,
    });

    // A card saved for the free month starts the trial.
    if (charge.meta?.trial === true && charge.plan_id) {
      const { data: trial } = await admin.rpc("start_trial", {
        _user_id: charge.user_id,
        _plan_id: charge.plan_id,
        _trial_days: Number(charge.meta?.trial_days ?? 30),
        _card_last4: last4,
        _card_expiry: expiry,
      });
      const started = (trial as { started?: boolean; period_end?: string } | null);
      if (started?.started) {
        await notifyBilling(admin, charge.user_id, "billing_plan_changed", {
          kind: "trial_started",
          plan_id: charge.plan_id,
          period_end: started.period_end,
        });
      }
      return { status: "paid", trial: Boolean(started?.started) };
    }
    return { status: "paid", taskId: charge.task_id };
  }

  // A card typed in for a waiting task: charged on the page.
  const verdict = evaluateLowProfileResult(result, { id: charge.id, amount: charge.amount }, terminal);
  if (verdict.kind === "pending") return { status: "pending", taskId: charge.task_id };
  if (verdict.kind === "failed") {
    await admin.rpc("billing_charge_failed", { _charge_id: charge.id, _reason: verdict.reason, _code: verdict.code });
    if (charge.task_id) {
      await notifyBilling(admin, charge.user_id, "task_payment_failed", {
        task_id: charge.task_id,
        task_name: await taskLabel(admin, charge.task_id),
        amount: charge.amount,
        reason: isHardDecline(verdict.code) ? "card_declined_hard" : verdict.reason,
      }, "/my-tasks?tab=published");
    }
    return { status: "failed", taskId: charge.task_id };
  }
  if (verdict.kind !== "paid") return { status: "pending", taskId: charge.task_id };

  const d = verdict.details;
  const { data: applied, error: applyError } = await admin.rpc("billing_charge_paid", {
    _charge_id: charge.id,
    _deal_number: d.dealNumber,
    _document_number: d.documentNumber,
    _document_url: d.documentUrl,
  });
  if (applyError) throw applyError;
  // The new card becomes the saved card, so later charges and renewals use it.
  if (d.token && charge.meta?.payment_mode !== "one_time") {
    await admin.rpc("save_payment_method", {
      _user_id: charge.user_id,
      _token: d.token,
      _card_last4: d.last4,
      _card_expiry: d.expiry,
    });
  }
  // Paid up front: the task still waits for review, so there is nothing to announce yet.
  if ((applied as { prepaid?: boolean } | null)?.prepaid) {
    return { status: "paid", taskId: charge.task_id, awaitingReview: true };
  }
  if ((applied as { applied?: boolean } | null)?.applied && charge.task_id) {
    await notifyBilling(admin, charge.user_id, "task_approved", {
      task_id: charge.task_id,
      task_name: await taskLabel(admin, charge.task_id),
      amount: charge.amount,
    }, "/my-tasks?tab=published");
  }
  return { status: "paid", taskId: charge.task_id };
}
