-- Two checkout pages open at once can both be paid. For a renewal the second
-- payment was already recognised (for_period_end); for an initial purchase it
-- was not, so the second payment silently started a fresh period and the
-- customer paid twice for one. An initial order that settles while the
-- subscription is already active is by definition a duplicate: it was created
-- before the first payment, because checkout refuses to create one once the
-- subscription is active.
CREATE OR REPLACE FUNCTION public.apply_paid_order(
  _order_id uuid,
  _deal_number bigint,
  _token text,
  _card_last4 text,
  _card_expiry text,
  _document_number bigint,
  _document_url text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF o.applied_at IS NOT NULL OR o.status = 'refunded' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_applied');
  END IF;

  SELECT * INTO plan FROM public.billing_plans WHERE id = o.plan_id;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = o.user_id FOR UPDATE;

  IF (o.kind = 'renewal' AND o.for_period_end IS NOT NULL
      AND sub.id IS NOT NULL AND sub.current_period_end <> o.for_period_end)
     OR (o.kind = 'initial' AND sub.id IS NOT NULL
         AND sub.status = 'active' AND sub.current_period_end > now()) THEN
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
$function$;
