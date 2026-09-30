import { describe, expect, it } from 'vitest';
import { billRule, toIcs } from '../src/lib/ics';
import type { Bill } from '../src/lib/types';

const bill = (extra: Partial<Bill> = {}): Bill => ({
  id: 'b', createdAt: '', updatedAt: '', name: 'Netflix', amount: 1590, accountId: 'card', repeat: 'monthly', start: '2026-10-21', auto: true, ...extra,
});

describe('calendar files', () => {
  it('repeat like the bill', () => {
    expect(billRule(bill())).toBe('FREQ=MONTHLY;BYMONTHDAY=21');
    expect(billRule(bill({ start: '2026-10-31', every: 2, end: '2027-04-30' }))).toBe('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1;UNTIL=20270430');
    expect(billRule(bill({ repeat: 'yearly' }))).toBe('FREQ=YEARLY');
  });

  it('writes all-day events with an alert the day before', () => {
    const ics = toIcs([{ uid: 'x', date: '2026-10-27', title: 'Rakuten Card: ¥64,858, 楽天カード' }], new Date('2026-09-30T00:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261027');
    expect(ics).toContain('DTEND;VALUE=DATE:20261028');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('SUMMARY:Rakuten Card: ¥64\\,858\\, 楽天カード');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
