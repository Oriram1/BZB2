import { supabase } from "@/integrations/supabase/client";

const GOOGLE_ROLE_KEY = "bzb-google-signup-role";

export type GoogleSignupRole = "tasker" | "bee" | "parent";

/**
 * Starts Google's redirect-based OAuth flow in the current browser context.
 *
 * Mobile browsers and installed PWAs do not handle the Google Identity Services
 * popup consistently; some open an empty custom tab that cannot communicate
 * with the app. Supabase's redirect flow keeps the OAuth state and session
 * exchange in one canonical path and returns through AuthCallback.
 */
export const startGoogleAuth = async (role?: GoogleSignupRole): Promise<void> => {
  if (role) localStorage.setItem(GOOGLE_ROLE_KEY, role);
  else localStorage.removeItem(GOOGLE_ROLE_KEY);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) {
    localStorage.removeItem(GOOGLE_ROLE_KEY);
    throw error;
  }
};

export const consumeGoogleSignupRole = (): GoogleSignupRole | null => {
  const role = localStorage.getItem(GOOGLE_ROLE_KEY);
  localStorage.removeItem(GOOGLE_ROLE_KEY);
  return role === "tasker" || role === "bee" || role === "parent" ? role : null;
};
