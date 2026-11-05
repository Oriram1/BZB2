import { describe, expect, it } from 'vitest';
import { reviewWindowOpen } from './reviewWindow';

describe('review window', () => {
  const start = '2026-11-01T12:00:00.000Z';
  it('allows legacy tasks and new tasks until their deadline', () => {
    expect(reviewWindowOpen(null)).toBe(true);
    expect(reviewWindowOpen(start, Date.parse('2026-11-15T12:00:00.000Z'))).toBe(true);
  });
  it('closes immediately after 14 days and fails closed for invalid timestamps', () => {
    expect(reviewWindowOpen(start, Date.parse('2026-11-15T12:00:00.001Z'))).toBe(false);
    expect(reviewWindowOpen('invalid')).toBe(false);
  });
});
