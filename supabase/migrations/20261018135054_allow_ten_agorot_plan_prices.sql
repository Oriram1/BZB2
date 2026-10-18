-- Allow ten-agorot subscription prices for payment testing. Prices are unchanged.
ALTER TABLE public.billing_plans DROP CONSTRAINT billing_plans_amount_range;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_amount_range
  CHECK (amount BETWEEN 0.10 AND 1000);

CREATE OR REPLACE FUNCTION public.admin_set_plan_price(
  _plan_id TEXT,
  _amount NUMERIC,
  _signature TEXT,
  _actor UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  old_amount NUMERIC;
BEGIN
  IF _amount IS NULL OR _amount < 0.10 OR _amount > 1000 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF _signature IS NULL OR length(_signature) <> 64 THEN
    RAISE EXCEPTION 'invalid_signature';
  END IF;

  SELECT amount INTO old_amount FROM public.billing_plans WHERE id = _plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_plan';
  END IF;

  PERFORM set_config('app.plan_price_source', 'admin_function', true);
  PERFORM set_config('app.plan_price_actor', COALESCE(_actor::text, ''), true);

  UPDATE public.billing_plans
     SET amount = _amount,
         price_signature = _signature,
         updated_at = now(),
         updated_by = _actor
   WHERE id = _plan_id;

  RETURN jsonb_build_object('plan_id', _plan_id, 'old_amount', old_amount, 'new_amount', _amount);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_plan_price(TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan_price(TEXT, NUMERIC, TEXT, UUID) TO service_role;
