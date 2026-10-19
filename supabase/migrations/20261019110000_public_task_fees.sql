-- The current per-task and insurance fee, readable by everyone (pricing page,
-- terms, publish form) so no screen has to hard-code the amount.
CREATE OR REPLACE FUNCTION public.get_task_fees()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'task_fee', public.billing_setting_number('task_fee', 3),
    'insurance_fee', public.billing_setting_number('insurance_fee', 5)
  );
$$;
REVOKE ALL ON FUNCTION public.get_task_fees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_fees() TO anon, authenticated;
