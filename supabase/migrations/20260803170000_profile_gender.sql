-- Hebrew inflects verbs and nouns by gender, so every notification the app
-- sends has been writing "הגיש/ה" and "הילד/ה" — slash forms that read like a
-- form letter. Storing gender lets the copy address people the way a person
-- would.
--
-- 'unspecified' is a real answer, not a missing one: it means the person chose
-- not to say, and it renders in the plural — the same form used for anyone the
-- app cannot identify. Nothing in the product branches on this value beyond
-- wording.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
    CREATE TYPE public.gender AS ENUM ('male', 'female', 'unspecified');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender public.gender NOT NULL DEFAULT 'unspecified';

-- Every account that existed before this column did is set to male, at the
-- product owner's instruction; those people can change it from their profile.
-- Written as a one-off backfill rather than a default so that accounts created
-- from here on still start at 'unspecified' and are asked during signup.
UPDATE public.profiles SET gender = 'male' WHERE gender = 'unspecified';
