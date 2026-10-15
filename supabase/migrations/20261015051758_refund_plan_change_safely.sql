-- Each Cardcom refund is claimed before the external request. An interrupted
-- request must be reconciled manually; retrying it could refund twice.
CREATE TABLE public.billing_refund_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('cancellation', 'payment_order', 'plan_change')),
  target_id UUID NOT NULL,
  transaction_id BIGINT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'succeeded', 'failed')),
  response_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (target_kind, target_id),
  CHECK ((target_kind = 'cancellation' AND transaction_id IS NULL)
      OR (target_kind <> 'cancellation' AND transaction_id IS NOT NULL))
);

CREATE INDEX billing_refund_attempts_user_idx ON public.billing_refund_attempts (user_id, created_at DESC);
ALTER TABLE public.billing_refund_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_refund_attempts FROM PUBLIC, anon, authenticated;
