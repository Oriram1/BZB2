-- Explicit one-time payment choice never authorizes a saved-card charge.
ALTER TABLE public.tasks ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'saved_card'
  CHECK (payment_mode IN ('saved_card', 'one_time'));


CREATE OR REPLACE FUNCTION public.task_billing_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quote JSONB;
  recent INTEGER;
BEGIN
  IF NOT public.task_billing_enabled() THEN
    NEW.publish_state := 'live';
    NEW.payment_due := 0;
    NEW.uses_free_slot := false;
    NEW.insurance := false;
    NEW.fee_amount := 0;
    RETURN NEW;
  END IF;

  -- Limits how fast one account can fill the review queue.
  SELECT count(*) INTO recent FROM public.tasks
   WHERE creator_id = NEW.creator_id AND created_at > now() - interval '1 hour';
  IF recent >= 5 THEN
    RAISE EXCEPTION 'too_many_submissions' USING ERRCODE = 'P0001';
  END IF;

  quote := public.task_publish_quote(NEW.creator_id, NEW.insurance);

  IF (quote->>'due')::NUMERIC > 0 THEN
    IF NEW.payment_mode = 'saved_card' AND NOT (quote->>'has_card')::BOOLEAN THEN
      RAISE EXCEPTION 'card_required' USING ERRCODE = 'P0001';
    END IF;
    IF (quote->>'pending_payment_count')::INTEGER >= 3 THEN
      RAISE EXCEPTION 'too_many_pending_payment' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.publish_state := 'pending_review';
  NEW.payment_due := (quote->>'due')::NUMERIC;
  NEW.uses_free_slot := (quote->>'free_slot')::BOOLEAN;
  NEW.fee_amount := (quote->>'fee_amount')::NUMERIC;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.charged_at := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_task_billing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims JSONB := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::JSONB, '{}'::JSONB);
BEGIN
  IF claims->>'role' = 'authenticated'
     AND COALESCE(current_setting('app.task_billing_write', true), '') <> '1' THEN
    IF NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
       OR NEW.publish_state IS DISTINCT FROM OLD.publish_state
       OR NEW.insurance IS DISTINCT FROM OLD.insurance
       OR NEW.payment_due IS DISTINCT FROM OLD.payment_due
       OR NEW.uses_free_slot IS DISTINCT FROM OLD.uses_free_slot
       OR NEW.fee_amount IS DISTINCT FROM OLD.fee_amount
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_note IS DISTINCT FROM OLD.review_note
       OR NEW.charged_at IS DISTINCT FROM OLD.charged_at
       OR NEW.pending_payment_since IS DISTINCT FROM OLD.pending_payment_since
       OR NEW.payment_reminded_at IS DISTINCT FROM OLD.payment_reminded_at
       OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at THEN
      RAISE EXCEPTION 'immutable_task_billing_fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
         reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
         pending_payment_since = NULL, payment_reminded_at = NULL
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'due', (quote->>'due')::NUMERIC);
END;
$$;
