-- The free task goes to the first task an admin APPROVES, not the first one
-- submitted. A paid task is refunded automatically when it is deleted or
-- rejected after the card was charged.
--
-- Submission still quotes as before (the first task looks free, a second one
-- while it waits looks paid, so a card is on file). The final decision is made
-- when an admin approves: whichever task is approved first and has not been
-- paid for takes the free slot, and the other one pays its fee.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0);

COMMENT ON COLUMN public.tasks.fee_amount IS
  'The publishing fee this task owes unless it takes the free slot at approval. 0 for a subscriber.';

-- Quote now also says what the fee would be.
CREATE OR REPLACE FUNCTION public.task_publish_quote(_user_id UUID, _insurance BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.billing_user_state%ROWTYPE;
  subscriber BOOLEAN;
  free_slot_taken BOOLEAN;
  fee NUMERIC := public.billing_setting_number('task_fee', 3);
  ins NUMERIC := public.billing_setting_number('insurance_fee', 5);
  base NUMERIC := 0;
  uses_free BOOLEAN := false;
  due NUMERIC;
  has_card BOOLEAN;
  pending_payment_count INTEGER;
BEGIN
  SELECT * INTO st FROM public.billing_user_state WHERE user_id = _user_id;
  subscriber := public.has_active_subscription(_user_id);

  -- A free slot is also taken while another task of this user is still waiting
  -- for review on it, so two submissions cannot both ride the same free slot.
  free_slot_taken := st.free_task_used_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.tasks
       WHERE creator_id = _user_id AND uses_free_slot
         AND publish_state IN ('pending_review', 'awaiting_charge', 'pending_payment', 'live')
    );

  IF subscriber THEN
    base := 0;
  ELSIF NOT free_slot_taken THEN
    base := 0;
    uses_free := true;
  ELSE
    base := fee;
  END IF;

  due := base + CASE WHEN COALESCE(_insurance, false) THEN ins ELSE 0 END;

  SELECT EXISTS (SELECT 1 FROM public.payment_methods WHERE user_id = _user_id) INTO has_card;
  SELECT count(*) INTO pending_payment_count
    FROM public.tasks WHERE creator_id = _user_id AND publish_state = 'pending_payment';

  RETURN jsonb_build_object(
    'due', due,
    'task_fee', base,
    'insurance_fee', CASE WHEN COALESCE(_insurance, false) THEN ins ELSE 0 END,
    'fee_amount', CASE WHEN subscriber THEN 0 ELSE fee END,
    'free_slot', uses_free,
    'subscriber', subscriber,
    'has_card', has_card,
    'pending_payment_count', pending_payment_count
  );
END;
$$;

-- Insert gate stores the fee next to the due amount.
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
    IF NOT (quote->>'has_card')::BOOLEAN THEN
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

-- fee_amount is as untouchable by a client as payment_due.
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
    IF NEW.publish_state IS DISTINCT FROM OLD.publish_state
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

-- ---------------------------------------------------------------------------
-- Approval decides who gets the free slot.
-- ---------------------------------------------------------------------------
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
     SET publish_state = 'awaiting_charge', payment_due = new_due, uses_free_slot = takes_free,
         reviewed_by = _admin_id, reviewed_at = now(), review_note = _note
   WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'state', 'awaiting_charge', 'user_id', t.creator_id, 'due', new_due);
END;
$$;
REVOKE ALL ON FUNCTION public.task_review_decide(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_review_decide(UUID, UUID, BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Refunds of a task fee. One row per task, never two: the UNIQUE key is what
-- makes a repeated trigger or a repeated worker run harmless.
--   requested  a paid task was deleted or rejected; money must go back
--   started    claimed before the Cardcom call. An interrupted request is
--              reconciled by hand: retrying it could refund twice
--   succeeded / failed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_name TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('deleted', 'rejected')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'started', 'succeeded', 'failed')),
  response_code INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS task_refunds_open_idx ON public.task_refunds (created_at) WHERE status = 'requested';
ALTER TABLE public.task_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_refunds FROM PUBLIC, anon, authenticated;
CREATE POLICY "Admins read task refunds" ON public.task_refunds
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.task_refunds TO authenticated;

-- A task whose fee was paid and is now deleted (archived by an admin) or
-- rejected asks for its money back. Only the charge Cardcom confirmed counts.
CREATE OR REPLACE FUNCTION public.queue_task_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paid NUMERIC;
  why TEXT;
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
    why := 'deleted';
  ELSIF OLD.publish_state <> 'rejected' AND NEW.publish_state = 'rejected' THEN
    why := 'rejected';
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO paid
    FROM public.billing_charges
   WHERE task_id = NEW.id AND purpose = 'task' AND status = 'paid' AND deal_number IS NOT NULL
     AND refunded_at IS NULL;

  IF paid > 0 THEN
    INSERT INTO public.task_refunds (task_id, user_id, task_name, reason, amount)
    VALUES (NEW.id, NEW.creator_id, NEW.name, why, paid)
    ON CONFLICT (task_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_task_refund() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS queue_task_refund ON public.tasks;
CREATE TRIGGER queue_task_refund
  AFTER UPDATE OF archived_at, publish_state ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.queue_task_refund();

-- The worker claims one request at a time. Returns the charges to refund, or
-- nothing when another run got there first.
CREATE OR REPLACE FUNCTION public.task_refund_claim(_refund_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.task_refunds%ROWTYPE;
  charges JSONB;
BEGIN
  UPDATE public.task_refunds SET status = 'started'
   WHERE id = _refund_id AND status = 'requested'
   RETURNING * INTO r;
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'deal_number', deal_number)), '[]'::JSONB)
    INTO charges
    FROM public.billing_charges
   WHERE task_id = r.task_id AND purpose = 'task' AND status = 'paid' AND deal_number IS NOT NULL
     AND refunded_at IS NULL;
  RETURN jsonb_build_object('id', r.id, 'user_id', r.user_id, 'task_id', r.task_id, 'task_name', r.task_name,
                            'amount', r.amount, 'charges', charges);
END;
$$;
REVOKE ALL ON FUNCTION public.task_refund_claim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_refund_claim(UUID) TO service_role;

-- One charge came back from Cardcom.
CREATE OR REPLACE FUNCTION public.task_refund_charge_done(_charge_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.billing_charges SET status = 'refunded', refunded_at = now()
   WHERE id = _charge_id AND status = 'paid';
$$;
REVOKE ALL ON FUNCTION public.task_refund_charge_done(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_refund_charge_done(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.task_refund_finish(_refund_id UUID, _ok BOOLEAN, _code INTEGER, _error TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.task_refunds
     SET status = CASE WHEN _ok THEN 'succeeded' ELSE 'failed' END,
         response_code = _code, error = left(_error, 200), completed_at = now()
   WHERE id = _refund_id AND status = 'started';
$$;
REVOKE ALL ON FUNCTION public.task_refund_finish(UUID, BOOLEAN, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.task_refund_finish(UUID, BOOLEAN, INTEGER, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Every 10 minutes, same shape as the hourly billing worker: the URL and secret
-- come from Vault, and missing config makes it a no-op.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_task_refunds()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  renew_url TEXT;
  dispatch_secret TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.task_refunds WHERE status = 'requested') THEN
    RETURN;
  END IF;
  SELECT decrypted_secret INTO renew_url FROM vault.decrypted_secrets WHERE name = 'billing_renew_url';
  SELECT decrypted_secret INTO dispatch_secret FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';
  IF renew_url IS NULL OR dispatch_secret IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := replace(renew_url, 'billing-renew', 'task-refund'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', dispatch_secret),
    timeout_milliseconds := 55000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.run_task_refunds() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('task-refunds-10min', '*/10 * * * *', $$SELECT public.run_task_refunds()$$);
