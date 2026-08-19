-- Reviews: mutual rating after a task is completed.
-- reviewer_id rates reviewee_id for task task_id.
-- status: pending (awaiting admin approval) → approved | rejected.

CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text,
  status      public.review_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, reviewer_id)   -- one review per reviewer per task
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Reviewer can insert their own review
CREATE POLICY "reviewer can insert" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Everyone can read approved reviews
CREATE POLICY "anyone can read approved" ON public.reviews
  FOR SELECT USING (status = 'approved');

-- Reviewer can read their own (to see pending/rejected status)
CREATE POLICY "reviewer can read own" ON public.reviews
  FOR SELECT USING (auth.uid() = reviewer_id);

-- Service role full access (admin panel)
CREATE POLICY "service role all" ON public.reviews
  TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Average rating view per user (approved only)
CREATE VIEW public.user_avg_ratings AS
  SELECT
    reviewee_id AS user_id,
    round(avg(rating)::numeric, 1) AS avg_rating,
    count(*) AS review_count
  FROM public.reviews
  WHERE status = 'approved'
  GROUP BY reviewee_id;
