-- Paying for a task before it is reviewed.
--
-- A task submitted with payment_mode 'one_time' can now be paid right away on
-- Cardcom's page (Apple Pay, Google Pay or Bit). The payment is recorded while
-- the task waits for review, approval publishes it without another charge, and
-- rejection or deletion refunds it through the existing task_refunds queue.
-- Unpaid one_time tasks keep the old path: approval -> pending_payment.

CREATE OR REPLACE FUNCTION public.billing_charge_paid(
  _charge_id UUID,
  _deal_number BIGINT,
  _document_number BIGINT,
  _document_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.billing_charges%ROWTYPE;
  t public.tasks%ROWTYPE;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO c FROM public.billing_charges WHERE id = _charge_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'charge_not_found';
  END IF;
  IF c.applied_at IS NOT NULL OR c.status = 'refunded' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_applied', 'purpose', c.purpose);
  END IF;

  UPDATE public.billing_charges
     SET status = 'paid',
         deal_number = COALESCE(_deal_number, deal_number),
         document_number = _document_number,
         document_url = _document_url,
         paid_at = now(),
         applied_at = now(),
         error = NULL
   WHERE id = c.id;

  IF c.purpose = 'task' AND c.task_id IS NOT NULL THEN
    SELECT * INTO t FROM public.tasks WHERE id = c.task_id FOR UPDATE;
    IF t.id IS NOT NULL AND t.publish_state IN ('awaiting_charge', 'pending_payment') THEN
      UPDATE public.tasks
         SET publish_state = 'live', charged_at = now(), pending_payment_since = NULL, payment_reminded_at = NULL
       WHERE id = t.id
       RETURNING * INTO t;
      PERFORM public.task_went_live(t);
      RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'task_id', t.id,
                                'user_id', c.user_id, 'amount', c.amount);
    END IF;
    -- Paid up front while the task waits for review: record it, publish on approval.
    IF t.id IS NOT NULL AND t.publish_state = 'pending_review' AND t.payment_mode = 'one_time' AND t.charged_at IS NULL THEN
      UPDATE public.tasks SET charged_at = now() WHERE id = t.id;
      RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'task_id', t.id,
                                'user_id', c.user_id, 'amount', c.amount, 'prepaid', true);
    END IF;
    -- Paid for a task that is no longer waiting (deleted, or already live):
    -- keep the money record, grant nothing, let a human refund it.
    UPDATE public.billing_charges SET error = 'task_not_waiting' WHERE id = c.id;
    RETURN jsonb_build_object('applied', false, 'reason', 'task_not_waiting', 'purpose', c.purpose,
                              'user_id', c.user_id);
  END IF;

  RETURN jsonb_build_object('applied', true, 'purpose', c.purpose, 'user_id', c.user_id, 'amount', c.amount);
END;
$$;
REVOKE ALL ON FUNCTION public.billing_charge_paid(UUID, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_charge_paid(UUID, BIGINT, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.task_review_decide(
  _task_id UUID,
  _admin_id UUID,
  _approve BOOLEAN,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tasks%ROWTYPE;
  insurance_part NUMERIC;
  free_available BOOLEAN;
  takes_free BOOLEAN;
  new_due NUMERIC;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO t FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;
  IF t.publish_state <> 'pending_review' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending_review', 'state', t.publish_state);
  END IF;

  IF NOT _approve THEN
    UPDATE public.tasks
       SET publish_state = 'rejected', reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'state', 'rejected', 'user_id', t.creator_id, 'due', 0);
  END IF;

  -- Paid up front (Apple Pay, Google Pay or Bit while waiting for review): the
  -- money is in, so approval publishes it at the price that was paid.
  -- charged_at is cleared on resubmission, so a refund still in flight never counts.
  IF t.payment_mode = 'one_time' AND t.charged_at IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.billing_charges
        WHERE task_id = t.id AND purpose = 'task' AND status = 'paid' AND refunded_at IS NULL
     ) THEN
    UPDATE public.tasks
       SET publish_state = 'live', reviewed_by = _admin_id, reviewed_at = now(), review_note = _note,
           pending_payment_since = NULL, payment_reminded_at = NULL
     WHERE id = t.id
     RETURNING * INTO t;
    PERFORM public.task_went_live(t);
    RETURN jsonb_build_object('ok', true, 'state', 'live', 'user_id', t.creator_id, 'due', 0, 'prepaid', true);
  END IF;

  -- Two approvals for the same person must not both take the free slot.
  PERFORM pg_advisory_xact_lock(hashtextextended(t.creator_id::TEXT, 0));

  -- What is owed apart from the fee: the insurance add-on.
  insurance_part := t.payment_due - CASE WHEN t.uses_free_slot THEN 0 ELSE t.fee_amount END;
  IF insurance_part < 0 THEN insurance_part := 0; END IF;

  -- The free slot is open while it has not been used and no approved task is
  -- still waiting on its charge while holding it.
  free_available := NOT EXISTS (
        SELECT 1 FROM public.billing_user_state WHERE user_id = t.creator_id AND free_task_used_at IS NOT NULL
      )
    AND NOT EXISTS (
        SELECT 1 FROM public.tasks o
         WHERE o.creator_id = t.creator_id AND o.id <> t.id AND o.uses_free_slot
           AND o.publish_state IN ('awaiting_charge', 'pending_payment')
      );

  takes_free := t.fee_amount > 0 AND free_available;
  new_due := insurance_part + CASE WHEN takes_free THEN 0 ELSE t.fee_amount END;

  IF new_due = 0 THEN
    UPDATE public.tasks
       SET publish_state = 'live', payment_due = 0, uses_free_slot = takes_free,
           reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
     WHERE id = t.id
     RETURNING * INTO t;
    PERFORM public.task_went_live(t);
    RETURN jsonb_build_object('ok', true, 'state', 'live', 'user_id', t.creator_id, 'due', 0);
  END IF;

  UPDATE public.tasks
     SET publish_state = CASE WHEN t.payment_mode = 'one_time' THEN 'pending_payment'::public.task_publish_state ELSE 'awaiting_charge'::public.task_publish_state END,
         pending_payment_since = CASE WHEN t.payment_mode = 'one_time' THEN now() ELSE NULL END, payment_due = new_due, uses_free_slot = takes_free,
         reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN t.payment_mode = 'one_time' THEN 'pending_payment' ELSE 'awaiting_charge' END, 'user_id', t.creator_id, 'due', new_due);
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_draft_task(_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tasks%ROWTYPE;
  quote JSONB;
BEGIN
  PERFORM set_config('app.task_billing_write', '1', true);
  SELECT * INTO t FROM public.tasks WHERE id = _task_id AND creator_id = auth.uid() FOR UPDATE;
  IF t.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found');
  END IF;
  IF t.publish_state NOT IN ('draft', 'rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_draft');
  END IF;
  quote := public.task_publish_quote(t.creator_id, t.insurance);
  IF t.payment_mode = 'saved_card' AND (quote->>'due')::NUMERIC > 0 AND NOT (quote->>'has_card')::BOOLEAN THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_required');
  END IF;
  UPDATE public.tasks
     SET publish_state = 'pending_review', payment_due = (quote->>'due')::NUMERIC,
         uses_free_slot = (quote->>'free_slot')::BOOLEAN,
         reviewed_by = NULL, reviewed_at = NULL, review_note = NULL, charged_at = NULL,
         pending_payment_since = NULL, payment_reminded_at = NULL
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'due', (quote->>'due')::NUMERIC);
END;
$$;
