import { ROUTES } from "@/lib/routes";
import { readStorage } from "@/lib/storage";

export const CONSENT_KEY = "bzb_cookie_consent";
export const CONSENT_CHANGED = "bzb:consent-changed";
export type ConsentLevel = "all" | "essential" | null;

export function getStoredConsent(): ConsentLevel {
  const value = readStorage(CONSENT_KEY);
  return value === "all" || value === "essential" ? value : null;
}

/** Only public, fixed URLs without parameters may be sent to the metrics provider. */
export function allowPerformanceUrl(value: string, origin: string): boolean {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && (url.pathname === ROUTES.home || url.pathname === ROUTES.tasks)
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}
