// No imports: the Vite client reads this file through the @shared alias.

/** Kept in step with the tasks_short_desc_length constraint on public.tasks. */
export const SHORT_DESC_MAX = 120;

export const CATEGORY_VALUES = ["housework", "handyman", "tutoring", "babysitting", "pets", "gardening", "other"] as const;
export type CategoryValue = (typeof CATEGORY_VALUES)[number];
