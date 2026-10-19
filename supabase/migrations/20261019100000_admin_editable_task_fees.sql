-- Admin can read and change the per-task publishing fee and the insurance fee,
-- and put each back to its default. The values live in billing_settings, which
-- the browser cannot touch directly; these two functions are the only way, and
-- both check the admin role themselves.

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
    'defaults', jsonb_build_object('task_fee', 3, 'insurance_fee', 5)
  );
END;
$$;

-- _amount NULL puts the fee back to its default.
CREATE OR REPLACE FUNCTION public.admin_set_task_fee(_key TEXT, _amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_amount NUMERIC;
  new_amount NUMERIC;
  old_amount NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _key NOT IN ('task_fee', 'insurance_fee') THEN
    RAISE EXCEPTION 'unknown_fee';
  END IF;

  default_amount := CASE _key WHEN 'task_fee' THEN 3 ELSE 5 END;
  new_amount := COALESCE(_amount, default_amount);
  -- Whole agorot, zero (free) up to 1000.
  IF new_amount < 0 OR new_amount > 1000 OR round(new_amount, 2) <> new_amount THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  old_amount := public.billing_setting_number(_key, default_amount);
  INSERT INTO public.billing_settings (key, value, updated_at)
  VALUES (_key, to_char(new_amount, 'FM999990.00'), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_identifier, success, details)
  VALUES (auth.uid(), CASE WHEN _amount IS NULL THEN 'reset_task_fee' ELSE 'set_task_fee' END, _key, true,
          jsonb_build_object('old', old_amount, 'new', new_amount));

  RETURN jsonb_build_object('key', _key, 'old', old_amount, 'new', new_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_task_fees() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_task_fee(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_task_fees() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_task_fee(TEXT, NUMERIC) TO authenticated;
