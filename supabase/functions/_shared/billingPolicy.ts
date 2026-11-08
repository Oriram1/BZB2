// No imports: the Vite client reads this file through the @shared alias.

/** Days after the period ended that each renewal attempt is made. */
export const RETRY_OFFSETS_DAYS = [0, 3, 7, 14] as const;
