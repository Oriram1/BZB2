// No imports: the Vite client reads this file through the @shared alias.

/** The notification switches a parent can flip for their own address. */
export const PARENT_PREF_KEYS = [
  "notify_signin",
  "notify_accepted",
  "notify_digest",
  "notify_completed",
  "notify_cancelled",
] as const;

export type ParentPrefs = Record<(typeof PARENT_PREF_KEYS)[number], boolean>;
