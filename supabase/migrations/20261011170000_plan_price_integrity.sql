-- Plan prices: who may change them, and how a change that did not go through
-- the admin function is noticed.
--
--   * Only the service role writes billing_plans. The admin screen goes through
--     the `admin-set-plan-price` Edge Function, which checks the caller is an
--     admin, bounds the value, signs it and calls admin_set_plan_price().
--   * Every plan row carries an HMAC-SHA256 signature over (id, amount, period)
--     made with a key that lives only in the Edge Function environment, never in
--     the database. Billing refuses to charge a plan whose signature does not
--     match, so a changed amount in the table cannot be charged.
--   * Every amount change is recorded in billing_plan_price_history by a trigger,
--     including changes made with plain SQL, which show up with source
--     'direct_sql' and no actor.

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS price_signature TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_amount_range CHECK (amount BETWEEN 1 AND 1000);

-- The existing "Anyone can read plans" SELECT policy stays: the prices are shown
-- on the public pricing page. Writes are denied by RLS already (no policy), and
-- the grants are removed as well so a future policy cannot open them by accident.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_plans FROM anon, authenticated;

CREATE TABLE public.billing_plan_price_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(id),
  old_amount NUMERIC(10, 2) NOT NULL,
  new_amount NUMERIC(10, 2) NOT NULL,
  changed_by UUID,
  source TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_plan_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_plan_price_history FROM anon, authenticated;
GRANT SELECT ON public.billing_plan_price_history TO authenticated;
CREATE POLICY "Admins read plan price history"
  ON public.billing_plan_price_history FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_plan_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  actor TEXT := current_setting('app.plan_price_actor', true);
  src TEXT := current_setting('app.plan_price_source', true);
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    INSERT INTO public.billing_plan_price_history (plan_id, old_amount, new_amount, changed_by, source)
    VALUES (
      NEW.id, OLD.amount, NEW.amount,
      NULLIF(actor, '')::uuid,
      COALESCE(NULLIF(src, ''), 'direct_sql')
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_plans_log_price_change
  AFTER UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.log_plan_price_change();

-- The one sanctioned way to change a price. Called only by the Edge Function
-- (service role), which has already authenticated an admin and signed the row.
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
  IF _amount IS NULL OR _amount < 1 OR _amount > 1000 OR round(_amount, 2) <> _amount THEN
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
