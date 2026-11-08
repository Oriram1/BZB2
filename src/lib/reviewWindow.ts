const REVIEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Legacy completed tasks have no timestamp and remain reviewable. */
export function reviewWindowOpen(startedAt: string | null | undefined, now = Date.now()) {
  return !startedAt || new Date(startedAt).getTime() + REVIEW_WINDOW_MS >= now;
}
