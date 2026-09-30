import { describe, expect, it } from 'vitest';
import { billTxId, dueDates, duePayments, monthlyCost, nextDue, repeatLabel } from '../src/lib/bills';
import type { Bill } from '../src/lib/types';

const bill = (extra: Partial<Bill> = {}): Bill => ({
  id: 'b1', createdAt: '', updatedAt: '', name: 'Netflix', amount: 1590, accountId: 'card', repeat: 'monthly', start: '2026-08-21', auto: true, ...extra,
});

describe('due dates', () => {
  it('repeats monthly on the same day, using the last day in short months', () => {
    expect(dueDates(bill(), '2026-01-01', '2026-11-30')).toEqual(['2026-08-21', '2026-09-21', '2026-10-21', '2026-11-21']);
    expect(dueDates(bill({ start: '2026-01-31' }), '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(dueDates(bill({ start: '2028-01-31' }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('handles every N months, yearly and an end date', () => {
    expect(dueDates(bill({ every: 2, start: '2026-06-10' }), '2026-01-01', '2026-12-31')).toEqual(['2026-06-10', '2026-08-10', '2026-10-10', '2026-12-10']);
    expect(dueDates(bill({ repeat: 'yearly', start: '2025-03-05' }), '2025-01-01', '2027-12-31')).toEqual(['2025-03-05', '2026-03-05', '2027-03-05']);
    expect(dueDates(bill({ end: '2026-10-27', start: '2026-08-27' }), '2026-01-01', '2027-12-31')).toEqual(['2026-08-27', '2026-09-27', '2026-10-27']);
    expect(nextDue(bill(), '2026-09-22')).toBe('2026-10-21');
    expect(nextDue(bill({ end: '2026-09-21' }), '2026-09-22')).toBeUndefined();
  });

  it('labels and monthly costs', () => {
    expect(repeatLabel(bill())).toBe('Every month on the 21st');
    expect(repeatLabel(bill({ start: '2026-01-02', every: 2 }))).toBe('Every 2 months on the 2nd');
    expect(repeatLabel(bill({ repeat: 'yearly', start: '2026-03-05' }))).toBe('Every year on 5 Mar');
    expect(monthlyCost(bill({ repeat: 'yearly', amount: 12000 }))).toBe(1000);
  });
});

describe('automatic payments', () => {
  it('adds each due payment once, never again after it was deleted, and not for manual bills', () => {
    const due = duePayments([bill()], new Set([billTxId('b1', '2026-08-21')]), '2026-09-30', 'now');
    expect(due.map((t) => [t.id, t.date, t.amount, t.accountId, t.payee])).toEqual([['bill:b1:2026-09-21', '2026-09-21', 1590, 'card', 'Netflix']]);
    expect(duePayments([bill({ auto: false })], new Set(), '2026-09-30', 'now')).toEqual([]);
    expect(duePayments([bill({ deleted: true })], new Set(), '2026-09-30', 'now')).toEqual([]);
    expect(duePayments([bill({ start: '2026-10-01' })], new Set(), '2026-09-30', 'now')).toEqual([]);
  });
});
