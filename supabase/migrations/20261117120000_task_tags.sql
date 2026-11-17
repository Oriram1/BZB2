-- Task tags drawn in the Figma redesign (physical work, no experience needed,
-- one-off, flexible hours). A fixed vocabulary, enforced here so a client
-- cannot invent tags that no screen knows how to label.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_tags_allowed;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_tags_allowed
  CHECK (tags <@ ARRAY['physical', 'no_experience', 'one_time', 'flexible_hours']::text[]);
