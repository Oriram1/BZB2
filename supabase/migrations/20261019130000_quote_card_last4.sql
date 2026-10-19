-- The publish quote also carries the last four digits of the saved card, so the
-- confirmation before publishing can say which card will be charged. Only the
-- signed-in user's own card, and only the digits: never the token.
CREATE OR REPLACE FUNCTION public.my_publish_quote(_insurance BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.task_billing_enabled()
              THEN public.task_publish_quote(auth.uid(), _insurance)
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
