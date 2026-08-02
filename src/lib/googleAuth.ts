import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const GOOGLE_ROLE_KEY = "bzb-google-signup-role";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
let activeGoogleAuth: Promise<User> | null = null;

export type GoogleSignupRole = "tasker" | "bee" | "parent";

interface GoogleIdentityResponse {
  credential?: string;
}

interface GoogleIdentityClient {
  initialize(options: { client_id: string; callback: (response: GoogleIdentityResponse) => void; ux_mode?: "popup"; use_fedcm_for_prompt?: boolean }): void;
  renderButton(element: HTMLElement, options: { type?: "standard"; theme?: "outline"; size?: "large"; text?: "signin_with" | "signup_with" | "continue_with"; shape?: "rectangular" | "pill"; width?: number }): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityClient } };
  }
}

const getGoogleIdentity = (): GoogleIdentityClient => {
  if (!GOOGLE_CLIENT_ID) throw new Error("חסר Google Client ID");
  const identity = window.google?.accounts?.id;
  if (!identity) throw new Error("Google עדיין נטען. נסה שוב בעוד רגע.");
  return identity;
};

export const startGoogleAuth = (role: GoogleSignupRole | undefined, container: HTMLElement, onReady?: () => void): Promise<User> => {
  if (activeGoogleAuth) return activeGoogleAuth;

  if (role) localStorage.setItem(GOOGLE_ROLE_KEY, role);
  else localStorage.removeItem(GOOGLE_ROLE_KEY);

  activeGoogleAuth = new Promise<User>((resolve, reject) => {
    try {
      const identity = getGoogleIdentity();
      identity.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        ux_mode: "popup",
        use_fedcm_for_prompt: false,
        callback: (response) => {
          if (!response.credential) {
            reject(new Error("Google לא החזיר אסימון התחברות"));
            return;
          }

          void supabase.auth
            .signInWithIdToken({ provider: "google", token: response.credential })
            .then(({ data, error }) => {
              if (error) reject(error);
              else if (!data.user) reject(new Error("Google user could not be created"));
              else resolve(data.user);
            });
        },
      });
      identity.renderButton(container, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", width: Math.min(container.clientWidth || 360, 400) });
      onReady?.();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Google authentication failed"));
    }
  }).finally(() => {
    activeGoogleAuth = null;
  });

  return activeGoogleAuth;
};

export const consumeGoogleSignupRole = (): GoogleSignupRole | null => {
  const role = localStorage.getItem(GOOGLE_ROLE_KEY);
  localStorage.removeItem(GOOGLE_ROLE_KEY);
  return role === "tasker" || role === "bee" || role === "parent" ? role : null;
};
