CREATE TABLE public.pwa_install_prompt_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dismiss_count SMALLINT NOT NULL DEFAULT 0 CHECK (dismiss_count BETWEEN 0 AND 3),
  next_prompt_at TIMESTAMPTZ,
  permanently_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  installed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pwa_install_prompt_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own PWA prompt preference"
  ON public.pwa_install_prompt_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own PWA prompt preference"
  ON public.pwa_install_prompt_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own PWA prompt preference"
  ON public.pwa_install_prompt_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_pwa_install_prompt_preferences_updated_at
  BEFORE UPDATE ON public.pwa_install_prompt_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE ON public.pwa_install_prompt_preferences TO authenticated;
