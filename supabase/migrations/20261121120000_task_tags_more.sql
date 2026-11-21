-- Figma added two tags to the task cards: experience required, immediate payment.
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_tags_allowed;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_tags_allowed
  CHECK (tags <@ ARRAY['physical', 'no_experience', 'experience_required', 'one_time', 'flexible_hours', 'immediate_payment']::text[]);
