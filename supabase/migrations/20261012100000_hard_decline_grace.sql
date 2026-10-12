-- A hard decline (card reported stolen, lost or blocked) stops further charge
-- attempts, but the customer keeps access through the same grace window as any
-- other failed renewal. The subscription is marked cancel_at_period_end with
-- next_attempt_at set to the end of the window; billing_claim_due_renewals skips
-- cancel_at_period_end rows, so the card is not charged again, and this function
-- ends the subscription once that date arrives.
--
-- A normal user cancellation sets cancel_at_period_end while the period is still
-- running and leaves next_attempt_at empty, so it ends exactly when it did before.
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
     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.billing_finish_canceled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_finish_canceled() TO service_role;
