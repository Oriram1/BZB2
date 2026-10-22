-- The verified provider callback updates the saved method and its visible
-- subscription summary in one transaction. No renewal or plan fields change.
CREATE OR REPLACE FUNCTION public.complete_subscription_card_update(
  _charge_id UUID, _token TEXT, _card_last4 TEXT, _card_expiry TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charge public.billing_charges%ROWTYPE;
BEGIN
  SELECT * INTO charge FROM public.billing_charges WHERE id = _charge_id FOR UPDATE;
  IF NOT FOUND OR charge.purpose <> 'card_setup' OR charge.amount <> 0
    OR (charge.meta->>'card_update') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'invalid_card_update';
  END IF;
  IF charge.status = 'paid' THEN RETURN; END IF;
  IF charge.status <> 'pending' OR NULLIF(_token, '') IS NULL THEN
    RAISE EXCEPTION 'invalid_card_update';
  END IF;
  PERFORM public.save_payment_method(charge.user_id, _token, _card_last4, _card_expiry);
  UPDATE public.subscriptions SET card_last4 = _card_last4, card_expiry = _card_expiry
    WHERE user_id = charge.user_id;
  PERFORM public.billing_charge_paid(_charge_id, NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_subscription_card_update(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_subscription_card_update(UUID, TEXT, TEXT, TEXT) TO service_role;
