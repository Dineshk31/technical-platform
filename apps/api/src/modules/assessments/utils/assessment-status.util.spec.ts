import { describe, expect, it } from 'vitest';
import { computeEffectiveStatus } from './assessment-status.util.js';

describe('computeEffectiveStatus', () => {
  const hourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

  it('returns DRAFT, ARCHIVED unchanged — those are always admin-authoritative', () => {
    expect(computeEffectiveStatus({ status: 'DRAFT', startAt: hourAgo, endAt: hourFromNow })).toBe('DRAFT');
    expect(computeEffectiveStatus({ status: 'ARCHIVED', startAt: hourAgo, endAt: hourFromNow })).toBe('ARCHIVED');
  });

  it('returns COMPLETED unchanged (stored terminal state)', () => {
    expect(computeEffectiveStatus({ status: 'COMPLETED', startAt: twoHoursAgo, endAt: hourAgo })).toBe('COMPLETED');
  });

  it('keeps PUBLISHED as PUBLISHED before the start window', () => {
    expect(computeEffectiveStatus({ status: 'PUBLISHED', startAt: hourFromNow, endAt: twoHoursFromNow })).toBe(
      'PUBLISHED',
    );
  });

  it('derives ACTIVE when now is within the window', () => {
    expect(computeEffectiveStatus({ status: 'PUBLISHED', startAt: hourAgo, endAt: hourFromNow })).toBe('ACTIVE');
  });

  it('derives COMPLETED once the end time has passed, even though the stored value is still PUBLISHED', () => {
    expect(computeEffectiveStatus({ status: 'PUBLISHED', startAt: twoHoursAgo, endAt: hourAgo })).toBe('COMPLETED');
  });
});
