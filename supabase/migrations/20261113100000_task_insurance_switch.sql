-- Admin switch: whether users are offered task insurance at all. Off by
-- default. While off, the publish form hides the option, quotes never include
-- it, and a new task is stored without insurance whatever the client sends.
-- Tasks already submitted keep what they were quoted.

INSERT INTO public.billing_settings (key, value) VALUES ('insurance_enabled', 'off')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.task_insurance_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value = 'on' FROM public.billing_settings WHERE key = 'insurance_enabled'), false);
$$;
REVOKE ALL ON FUNCTION public.task_insurance_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_insurance_enabled() TO anon, authenticated, service_role;

-- Server gate: drop the insurance request on a new task while the switch is
-- off. Named so it fires before task_billing_on_insert (BEFORE triggers run in
-- name order), which then quotes the task without insurance.
CREATE OR REPLACE FUNCTION public.task_insurance_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.insurance AND NOT public.task_insurance_enabled() THEN
    NEW.insurance := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_billing_a_insurance_gate ON public.tasks;
CREATE TRIGGER task_billing_a_insurance_gate
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.task_insurance_gate();

-- The preview quote ignores an insurance request while the switch is off.
CREATE OR REPLACE FUNCTION public.my_publish_quote(_insurance BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.task_billing_enabled()
              THEN public.task_publish_quote(auth.uid(), COALESCE(_insurance, false) AND public.task_insurance_enabled())
                   || jsonb_build_object(
                        'card_last4',
                        (SELECT card_last4 FROM public.payment_methods WHERE user_id = auth.uid())
                      )
              ELSE jsonb_build_object('due', 0, 'task_fee', 0, 'insurance_fee', 0, 'free_slot', false,
                                      'subscriber', false, 'has_card', false, 'pending_payment_count', 0,
                                      'billing_off', true)
         END;
$$;
REVOKE ALL ON FUNCTION public.my_publish_quote(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_publish_quote(BOOLEAN) TO authenticated;

-- Public fees now also say whether insurance is offered.
CREATE OR REPLACE FUNCTION public.get_task_fees()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'task_fee', public.billing_setting_number('task_fee', 3),
    'insurance_fee', public.billing_setting_number('insurance_fee', 5),
    'insurance_enabled', public.task_insurance_enabled()
  );
$$;
REVOKE ALL ON FUNCTION public.get_task_fees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_fees() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_task_fees()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'task_fee', public.billing_setting_number('task_fee', 3),
    'insurance_fee', public.billing_setting_number('insurance_fee', 5),
    'insurance_enabled', public.task_insurance_enabled(),
    'defaults', jsonb_build_object('task_fee', 3, 'insurance_fee', 5)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_insurance_enabled(_enabled BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_enabled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_value';
  END IF;

  old_enabled := public.task_insurance_enabled();
  INSERT INTO public.billing_settings (key, value, updated_at)
  VALUES ('insurance_enabled', CASE WHEN _enabled THEN 'on' ELSE 'off' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_identifier, success, details)
  VALUES (auth.uid(), 'set_insurance_enabled', 'insurance_enabled', true,
          jsonb_build_object('old', old_enabled, 'new', _enabled));

  RETURN jsonb_build_object('old', old_enabled, 'new', _enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_insurance_enabled(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_insurance_enabled(BOOLEAN) TO authenticated;
