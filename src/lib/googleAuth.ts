import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const GOOGLE_ROLE_KEY = "bzb-google-signup-role";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
let activeGoogleAuth: Promise<User> | null = null;
let activeCredentialHandler: ((response: GoogleIdentityResponse) => void) | null = null;
let googleIdentityInitialized = false;
/**
 * Google embeds the hashed nonce in the id_token, and Supabase rejects the
 * token unless it is handed the raw value to hash and compare — "Passed nonce
 * and nonce in id_token should either both exist or not". FedCM mints a nonce
 * on its own, so leaving this unset is not the neutral option it looks like.
 * Generated once per page load and kept because initialize() runs only once.
 */
let googleNonce: { raw: string; hashed: string } | null = null;

const createNonce = async () => {
  const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
};

export type GoogleSignupRole = "tasker" | "bee" | "parent";

interface GoogleIdentityResponse {
  credential?: string;
}

interface GoogleIdentityClient {
  initialize(options: { client_id: string; callback: (response: GoogleIdentityResponse) => void; ux_mode?: "popup"; use_fedcm_for_button?: boolean; nonce?: string }): void;
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

  activeGoogleAuth = (async () => {
    const identity = getGoogleIdentity();
    if (!googleNonce) googleNonce = await createNonce();
    const nonce = googleNonce;

    return new Promise<User>((resolve, reject) => {
      try {
        activeCredentialHandler = (response) => {
          if (!response.credential) {
            reject(new Error("Google לא החזיר אסימון התחברות"));
            return;
          }

          void supabase.auth
            .signInWithIdToken({ provider: "google", token: response.credential, nonce: nonce.raw })
            .then(({ data, error }) => {
              if (error) reject(error);
              else if (!data.user) reject(new Error("Google user could not be created"));
              else resolve(data.user);
            });
        };

        if (!googleIdentityInitialized) {
          identity.initialize({
            client_id: GOOGLE_CLIENT_ID!,
            ux_mode: "popup",
            // Keep the classic GIS button flow. FedCM is still experimental in
            // some embedded browsers and can emit a network error before the
            // normal Google popup fallback is available.
            use_fedcm_for_button: false,
            nonce: nonce.hashed,
            callback: (response) => activeCredentialHandler?.(response),
          });
          googleIdentityInitialized = true;
        }
        identity.renderButton(container, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", width: Math.min(container.clientWidth || 360, 400) });
        onReady?.();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Google authentication failed"));
      }
    });
  })().finally(() => {
    activeGoogleAuth = null;
    activeCredentialHandler = null;
  });

  return activeGoogleAuth;
};

export const consumeGoogleSignupRole = (): GoogleSignupRole | null => {
  const role = localStorage.getItem(GOOGLE_ROLE_KEY);
  localStorage.removeItem(GOOGLE_ROLE_KEY);
  return role === "tasker" || role === "bee" || role === "parent" ? role : null;
};
