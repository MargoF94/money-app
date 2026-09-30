import { describe, expect, it } from 'vitest';
import { compactYen, computeStats, pinnedCategories, presetPeriod } from '../src/lib/stats';
import type { Account, Transaction } from '../src/lib/types';

const acct = (id: string, extra: Partial<Account> = {}): Account => ({
  id, createdAt: '', updatedAt: '', name: id, type: 'bank', currency: 'JPY', opening: 100000, openingDate: '2026-07-01', order: 0, ...extra,
});
let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, createdAt: '', updatedAt: '', date: '2026-08-10', kind: 'expense', accountId: 'bank', amount: 0, ...extra,
});
const accounts = [acct('bank'), acct('usd', { currency: 'USD' })];
const txs = [
  tx({ kind: 'income', amount: 400000, date: '2026-07-31', categoryId: 'salary' }),
  tx({ amount: 70000, date: '2026-08-01', categoryId: 'home', payee: 'Landlord', billId: 'rent' }),
  tx({ amount: 5000, categoryId: 'food', payee: 'Lawson' }),
  tx({ amount: 3000, categoryId: 'food', payee: 'ローソン' }),
  tx({ amount: 1000, categoryId: 'food', payee: 'Lawson', refund: true }),
  tx({ amount: 9999, accountId: 'usd', categoryId: 'food' }), // dollars: not in yen totals
  tx({ kind: 'transfer', toAccountId: 'x', amount: 50000 }), // never spending
  tx({ amount: 2000, date: '2026-09-02' }),
];

describe('stats', () => {
  it('presets', () => {
    expect(presetPeriod('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetPeriod('last-12', '2026-09-30')).toEqual({ from: '2025-10-01', to: '2026-09-30' });
  });

  it('totals, categories, payees and bills for a period', () => {
    const s = computeStats(accounts, txs, { from: '2026-07-01', to: '2026-08-31' }, '2026-09-30');
    expect([s.spent, s.income, s.saved, s.bills]).toEqual([77000, 400000, 323000, 70000]);
    expect(s.byCategory).toEqual([{ id: 'home', value: 70000 }, { id: 'food', value: 7000 }]);
    expect(s.payees.map((p) => [p.name, p.value])).toEqual([['Landlord', 70000], ['Lawson', 4000], ['ローソン', 3000]]);
    expect(s.days).toBe(62);
    expect(s.biggest?.amount).toBe(70000);
  });

  it('month by month, with net worth at each month end', () => {
    const s = computeStats(accounts, txs, { from: '2026-07-01', to: '2026-12-31' }, '2026-09-30');
    expect(s.months.map((m) => [m.label, m.income, m.spent])).toEqual([['Jul', 400000, 0], ['Aug', 0, 77000], ['Sep', 0, 2000]]);
    // bank starts at 100,000 (the dollar account is left out)
    expect(s.months.map((m) => m.netWorth)).toEqual([500000, 500000 - 77000 - 50000, 500000 - 77000 - 50000 - 2000]);
  });

  it('keeps colours for the 5 biggest categories of the last 12 months', () => {
    expect(pinnedCategories(txs, '2026-09-30')).toEqual(['home', 'food']);
  });

  it('compact numbers', () => {
    expect([compactYen(800000), compactYen(1250000), compactYen(950), compactYen(-12000)]).toEqual(['¥800K', '¥1.3M', '¥950', '−¥12K']);
  });
});
