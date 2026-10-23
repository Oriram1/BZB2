-- One free month per person, not per account.
--
-- billing_user_state.free_month_used_at dies with the account (ON DELETE
-- CASCADE), so deleting an account and registering again looked like a new
-- customer. These fingerprints have no foreign key and survive deletion. They
-- hold one-way hashes only: never a plain email, phone number or card detail.
--
-- A match only refuses the free month. The person can still register and pay.

CREATE TABLE public.trial_fingerprints (
  kind TEXT NOT NULL CHECK (kind IN ('email', 'phone', 'card')),
  fingerprint TEXT NOT NULL,
  -- Whoever got the free month first. Deliberately not a foreign key.
  first_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, fingerprint)
);
ALTER TABLE public.trial_fingerprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_fingerprints FROM PUBLIC, anon, authenticated;

-- Every refusal, for monitoring. Hashes only; no raw contact details.
CREATE TABLE public.trial_blocks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  stage TEXT NOT NULL CHECK (stage IN ('precheck', 'card_saved')),
  matched_kinds TEXT[] NOT NULL,
  matched_user_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_blocks FROM PUBLIC, anon, authenticated;
CREATE INDEX trial_blocks_created_at_idx ON public.trial_blocks (created_at DESC);

-- Emails are normalized by public.normalize_email (Gmail dots, "+tag", googlemail).

-- Last nine digits: 050-123-4567, +972501234567 and 0501234567 are one number.
CREATE OR REPLACE FUNCTION public.normalize_trial_phone(_phone TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE digits TEXT := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF length(digits) < 9 THEN RETURN NULL; END IF;
  RETURN right(digits, 9);
END;
$$;

CREATE OR REPLACE FUNCTION public.trial_fingerprint(_kind TEXT, _value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _value IS NULL OR _value = '' THEN NULL
    ELSE encode(sha256(convert_to(_kind || ':' || _value, 'UTF8')), 'hex') END;
$$;

-- The fingerprints of one person; card ones only once a card is known.
CREATE OR REPLACE FUNCTION public.trial_fingerprints_of(_user_id UUID, _last4 TEXT, _expiry TEXT)
RETURNS TABLE (kind TEXT, fingerprint TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'email', public.trial_fingerprint('email', public.normalize_email(u.email))
    FROM auth.users u WHERE u.id = _user_id
  UNION ALL
  SELECT 'phone', public.trial_fingerprint('phone', public.normalize_trial_phone(p.phone))
    FROM public.profiles p WHERE p.user_id = _user_id
  UNION ALL
  SELECT 'card', public.trial_fingerprint('card', nullif(coalesce(_last4, '') || ':' || coalesce(_expiry, ''), ':'))
   WHERE coalesce(_last4, '') <> '' AND coalesce(_expiry, '') <> '';
$$;

-- Which kinds already belong to somebody else.
CREATE OR REPLACE FUNCTION public.trial_matches(_user_id UUID, _last4 TEXT DEFAULT NULL, _expiry TEXT DEFAULT NULL)
RETURNS TABLE (kind TEXT, first_user_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.kind, t.first_user_id
    FROM public.trial_fingerprints_of(_user_id, _last4, _expiry) f
    JOIN public.trial_fingerprints t ON t.kind = f.kind AND t.fingerprint = f.fingerprint
   WHERE f.fingerprint IS NOT NULL AND t.first_user_id IS DISTINCT FROM _user_id;
$$;

-- Before the card page opens: is this person already known by email or phone?
CREATE OR REPLACE FUNCTION public.trial_precheck(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE kinds TEXT[]; owners UUID[];
BEGIN
  SELECT array_agg(kind), array_agg(DISTINCT first_user_id) FILTER (WHERE first_user_id IS NOT NULL)
    INTO kinds, owners FROM public.trial_matches(_user_id);
  IF kinds IS NULL THEN RETURN false; END IF;
  INSERT INTO public.trial_blocks (user_id, stage, matched_kinds, matched_user_ids)
    VALUES (_user_id, 'precheck', kinds, coalesce(owners, '{}'));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_trial(
  _user_id UUID, _plan_id TEXT, _trial_days INTEGER DEFAULT 30,
  _card_last4 TEXT DEFAULT NULL, _card_expiry TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used TIMESTAMPTZ;
  existing public.subscriptions%ROWTYPE;
  period_end TIMESTAMPTZ := now() + make_interval(days => _trial_days);
  kinds TEXT[];
  owners UUID[];
BEGIN
  SELECT free_month_used_at INTO used FROM public.billing_user_state WHERE user_id = _user_id FOR UPDATE;
  IF used IS NOT NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'trial_already_used');
  END IF;

  -- The same person under another account, or after deleting an old one.
  SELECT array_agg(kind), array_agg(DISTINCT first_user_id) FILTER (WHERE first_user_id IS NOT NULL)
    INTO kinds, owners FROM public.trial_matches(_user_id, _card_last4, _card_expiry);
  IF kinds IS NOT NULL THEN
    INSERT INTO public.trial_blocks (user_id, stage, matched_kinds, matched_user_ids)
      VALUES (_user_id, 'card_saved', kinds, coalesce(owners, '{}'));
    RETURN jsonb_build_object('started', false, 'reason', 'trial_already_used');
  END IF;

  SELECT * INTO existing FROM public.subscriptions WHERE user_id = _user_id FOR UPDATE;
  IF existing.id IS NOT NULL AND (existing.first_paid_at IS NOT NULL OR existing.status IN ('active', 'past_due')) THEN
    RETURN jsonb_build_object('started', false, 'reason', 'already_subscribed');
  END IF;

  INSERT INTO public.subscriptions (
    user_id, plan_id, status, current_period_start, current_period_end,
    card_last4, card_expiry, is_trial
  ) VALUES (
    _user_id, _plan_id, 'active', now(), period_end, _card_last4, _card_expiry, true
  )
  ON CONFLICT (user_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = 'active',
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = false, canceled_at = NULL,
        renewal_attempts = 0, next_attempt_at = NULL,
        card_last4 = EXCLUDED.card_last4, card_expiry = EXCLUDED.card_expiry,
        is_trial = true;

  INSERT INTO public.billing_user_state (user_id, free_month_used_at)
  VALUES (_user_id, now())
  ON CONFLICT (user_id) DO UPDATE SET free_month_used_at = now(), updated_at = now();

  INSERT INTO public.trial_fingerprints (kind, fingerprint, first_user_id)
    SELECT f.kind, f.fingerprint, _user_id
      FROM public.trial_fingerprints_of(_user_id, _card_last4, _card_expiry) f
     WHERE f.fingerprint IS NOT NULL
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('started', true, 'period_end', period_end);
END;
$$;
REVOKE ALL ON FUNCTION public.start_trial(UUID, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_trial(UUID, TEXT, INTEGER, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.trial_fingerprints_of(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_matches(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trial_precheck(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_precheck(UUID) TO service_role;

-- People who already had the free month stay covered. The oldest holder of a
-- shared value keeps it.
INSERT INTO public.trial_fingerprints (kind, fingerprint, first_user_id)
  SELECT f.kind, f.fingerprint, s.user_id
    FROM public.billing_user_state s
    LEFT JOIN public.subscriptions sub ON sub.user_id = s.user_id
    CROSS JOIN LATERAL public.trial_fingerprints_of(s.user_id, sub.card_last4, sub.card_expiry) f
   WHERE s.free_month_used_at IS NOT NULL AND f.fingerprint IS NOT NULL
   ORDER BY s.free_month_used_at
ON CONFLICT DO NOTHING;

-- Monitoring: one row per day, for a dashboard or a weekly look.
CREATE OR REPLACE VIEW public.trial_abuse_daily AS
  SELECT date_trunc('day', created_at)::date AS day,
         count(*) AS blocked,
         count(*) FILTER (WHERE 'card' = ANY (matched_kinds)) AS by_card,
         count(*) FILTER (WHERE 'email' = ANY (matched_kinds)) AS by_email,
         count(*) FILTER (WHERE 'phone' = ANY (matched_kinds)) AS by_phone,
         count(DISTINCT user_id) AS distinct_users
    FROM public.trial_blocks GROUP BY 1;
REVOKE ALL ON public.trial_abuse_daily FROM PUBLIC, anon, authenticated;
