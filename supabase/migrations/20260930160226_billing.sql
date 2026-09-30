-- Subscription billing on Cardcom.
--
-- Who may write what:
--   * The browser can only READ its own subscription and orders. Every write
--     comes from an Edge Function or a SECURITY DEFINER command below, running
--     as service_role. There is deliberately no INSERT/UPDATE policy anywhere.
--   * A payment is only ever recorded after the server asked Cardcom
--     (LowProfile/GetLpResult) what happened. Nothing a client or a webhook body
--     claims is trusted.
--   * The saved-card token never leaves the server: payment_methods has RLS on
--     and no policy, so only service_role can read it.

CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'expired');
CREATE TYPE public.payment_order_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.payment_order_kind AS ENUM ('initial', 'renewal');

-- ---------------------------------------------------------------------------
-- Plans. The price the customer is charged always comes from here, never from
-- a request parameter.
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  period_months SMALLINT NOT NULL CHECK (period_months > 0),
  renewal_reminder_days SMALLINT NOT NULL CHECK (renewal_reminder_days >= 0),
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.billing_plans (id, name, amount, period_months, renewal_reminder_days) VALUES
  ('quarterly', 'רבעוני', 30.00, 3, 3),
  ('annual', 'שנתי', 100.00, 12, 7);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans"
  ON public.billing_plans FOR SELECT TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- One subscription row per user. Re-subscribing after it ended reuses the row.
--   active    paid, inside the period (cancel_at_period_end may be set)
--   past_due  period ended, renewal failing, still inside the grace window
--   canceled  the user cancelled and the paid period is over
--   expired   renewal failed through the whole grace window
-- ---------------------------------------------------------------------------
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(id),
  status public.subscription_status NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  -- Display only. The token itself lives in payment_methods.
  card_last4 TEXT,
  card_expiry TEXT,
  renewal_attempts SMALLINT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  reminder_for_period_end TIMESTAMPTZ,
  first_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_due_idx
  ON public.subscriptions (current_period_end)
  WHERE status IN ('active', 'past_due');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscription"
  ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Saved card token. Server-only: RLS on, no policy.
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_methods (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  card_expiry TEXT,
  card_last4 TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Every attempt to charge, successful or not.
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(id),
  kind public.payment_order_kind NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status public.payment_order_status NOT NULL DEFAULT 'pending',
  -- Cardcom's id for the hosted page. Unique so one page settles one order.
  low_profile_id TEXT UNIQUE,
  -- For a renewal: the period end it pays for. If the subscription has moved
  -- past it by the time the charge settles, another payment already bought
  -- that period and this one must not extend it a second time.
  for_period_end TIMESTAMPTZ,
  -- Idempotency key for token charges (Cardcom answers 608 on a repeat).
  external_uniq_id TEXT UNIQUE,
  -- The card transaction. Unique so one charge can never buy two periods.
  deal_number BIGINT UNIQUE,
  response_code INTEGER,
  error TEXT,
  document_number BIGINT,
  document_url TEXT,
  -- Set inside apply_paid_order in the same transaction that extends the
  -- subscription; the marker that makes settling idempotent.
  applied_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payment_orders_user_idx ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX payment_orders_pending_idx ON public.payment_orders (created_at) WHERE status = 'pending';

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payment orders"
  ON public.payment_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Raw webhook log for diagnosis. Server-only.
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  low_profile_id TEXT,
  order_id UUID,
  outcome TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Access check other parts of the app can lean on. Grace period counts as
-- access: a user whose card just failed is not locked out mid-retry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND status IN ('active', 'past_due')
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_subscription(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_paid_order: the one place a successful charge turns into a paid period.
--
-- Called by billing-webhook, billing-confirm and billing-renew, in any order and
-- any number of times, so it has to be idempotent: the order row is locked and
-- `applied_at` says whether the period was already granted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_paid_order(
  _order_id UUID,
  _deal_number BIGINT,
  _token TEXT,
  _card_last4 TEXT,
  _card_expiry TEXT,
  _document_number BIGINT,
  _document_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.payment_orders%ROWTYPE;
  plan public.billing_plans%ROWTYPE;
  sub public.subscriptions%ROWTYPE;
  new_start TIMESTAMPTZ;
  new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Already granted (or refunded since): nothing more to do.
  IF o.applied_at IS NOT NULL OR o.status = 'refunded' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_applied');
  END IF;

  SELECT * INTO plan FROM public.billing_plans WHERE id = o.plan_id;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = o.user_id FOR UPDATE;

  -- A renewal that pays for a period the subscription already moved past was
  -- charged twice: keep the money record, grant nothing.
  IF o.kind = 'renewal' AND o.for_period_end IS NOT NULL
     AND sub.id IS NOT NULL AND sub.current_period_end <> o.for_period_end THEN
    UPDATE public.payment_orders
       SET status = 'paid',
           deal_number = COALESCE(_deal_number, deal_number),
           document_number = _document_number,
           document_url = _document_url,
           paid_at = now(),
           applied_at = now(),
           error = 'period_already_paid'
     WHERE id = o.id;
    RETURN jsonb_build_object('applied', false, 'reason', 'period_already_paid');
  END IF;

  IF o.kind = 'renewal' AND sub.id IS NOT NULL THEN
    -- Contiguous with the period that just ended, so a late retry does not
    -- silently shift the billing date.
    new_start := sub.current_period_end;
  ELSE
    new_start := now();
  END IF;
  new_end := new_start + make_interval(months => plan.period_months);

  UPDATE public.payment_orders
     SET status = 'paid',
         deal_number = COALESCE(_deal_number, deal_number),
         document_number = _document_number,
         document_url = _document_url,
         paid_at = now(),
         applied_at = now(),
         error = NULL
   WHERE id = o.id;

  IF _token IS NOT NULL AND _token <> '' THEN
    INSERT INTO public.payment_methods (user_id, token, card_expiry, card_last4)
    VALUES (o.user_id, _token, _card_expiry, _card_last4)
    ON CONFLICT (user_id) DO UPDATE
      SET token = EXCLUDED.token,
          card_expiry = EXCLUDED.card_expiry,
          card_last4 = EXCLUDED.card_last4,
          updated_at = now();
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, status, current_period_start, current_period_end,
    card_last4, card_expiry, first_paid_at
  ) VALUES (
    o.user_id, o.plan_id, 'active', new_start, new_end,
    _card_last4, _card_expiry, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = false,
        canceled_at = NULL,
        renewal_attempts = 0,
        next_attempt_at = NULL,
        card_last4 = COALESCE(EXCLUDED.card_last4, public.subscriptions.card_last4),
        card_expiry = COALESCE(EXCLUDED.card_expiry, public.subscriptions.card_expiry),
        first_paid_at = COALESCE(public.subscriptions.first_paid_at, EXCLUDED.first_paid_at);

  RETURN jsonb_build_object(
    'applied', true,
    'kind', o.kind,
    'user_id', o.user_id,
    'plan_id', o.plan_id,
    'plan_name', plan.name,
    'amount', o.amount,
    'period_end', new_end
  );
END;
$$;
REVOKE ALL ON FUNCTION public.apply_paid_order(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paid_order(UUID, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Renewal work queue. Claiming pushes next_attempt_at an hour ahead in the same
-- statement, so two overlapping cron runs never charge the same subscription;
-- the caller overwrites that placeholder with the real outcome.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_claim_due_renewals(_limit INTEGER DEFAULT 50)
RETURNS SETOF public.subscriptions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions s
     SET next_attempt_at = now() + interval '1 hour'
   WHERE s.id IN (
     SELECT id FROM public.subscriptions
      WHERE status IN ('active', 'past_due')
        AND cancel_at_period_end = false
        AND current_period_end <= now()
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY current_period_end
      LIMIT _limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING s.*;
$$;
REVOKE ALL ON FUNCTION public.billing_claim_due_renewals(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_due_renewals(INTEGER) TO service_role;

-- Subscriptions the user cancelled whose paid period is now over.
CREATE OR REPLACE FUNCTION public.billing_finish_canceled()
RETURNS SETOF public.subscriptions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
     SET status = 'canceled', next_attempt_at = NULL
   WHERE status IN ('active', 'past_due')
     AND cancel_at_period_end = true
     AND current_period_end <= now()
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.billing_finish_canceled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_finish_canceled() TO service_role;

-- Renewals coming up that the user has not been warned about yet. Claiming
-- marks the period as reminded in the same statement, which is what makes each
-- reminder go out exactly once even if two cron runs overlap.
CREATE OR REPLACE FUNCTION public.billing_claim_reminders()
RETURNS TABLE (
  subscription_id UUID,
  user_id UUID,
  plan_id TEXT,
  plan_name TEXT,
  amount NUMERIC,
  current_period_end TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions s
     SET reminder_for_period_end = s.current_period_end
    FROM public.billing_plans p
   WHERE p.id = s.plan_id
     AND s.status = 'active'
     AND s.cancel_at_period_end = false
     AND s.current_period_end > now()
     AND s.current_period_end <= now() + make_interval(days => p.renewal_reminder_days)
     AND s.reminder_for_period_end IS DISTINCT FROM s.current_period_end
  RETURNING s.id, s.user_id, s.plan_id, p.name, p.amount, s.current_period_end;
$$;
REVOKE ALL ON FUNCTION public.billing_claim_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_reminders() TO service_role;

-- ---------------------------------------------------------------------------
-- Hourly trigger for billing-renew, same shape as the parent digest: config in
-- Vault, missing config makes it a no-op.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_billing_renew()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  renew_url TEXT;
  dispatch_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO renew_url
    FROM vault.decrypted_secrets WHERE name = 'billing_renew_url';
  SELECT decrypted_secret INTO dispatch_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_secret';

  IF renew_url IS NULL OR dispatch_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := renew_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', dispatch_secret
    ),
    timeout_milliseconds := 55000
  );
END;
$$;

SELECT cron.schedule(
  'billing-renew-hourly',
  '20 * * * *',
  $$SELECT public.run_billing_renew()$$
);
