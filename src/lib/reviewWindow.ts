/** Legacy completed tasks have no timestamp and remain reviewable. */
export function reviewWindowOpen(startedAt: string | null | undefined, now = Date.now()) {
  return !startedAt || new Date(startedAt).getTime() + 14 * 24 * 60 * 60 * 1000 >= now;
}
