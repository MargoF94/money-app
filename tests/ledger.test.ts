import { describe, expect, it } from 'vitest';
import { balances, totals } from '../src/lib/ledger';
import type { Account, Transaction } from '../src/lib/types';

const acct = (id: string, extra: Partial<Account> = {}): Account => ({
  id, createdAt: '', updatedAt: '', name: id, type: 'bank', currency: 'JPY', opening: 0, openingDate: '2026-10-01', order: 0, ...extra,
});
let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, createdAt: '', updatedAt: '', date: '2026-10-05', kind: 'expense', accountId: 'bank', amount: 0, ...extra,
});

describe('balances', () => {
  const accounts = [
    acct('bank', { opening: 100000 }),
    acct('card', { type: 'card', opening: -20000 }),
    acct('pasmo', { type: 'prepaid', opening: 500, topUpFromId: 'card' }),
  ];

  it('follows expenses, income, top-ups, card payments and refunds', () => {
    const txs = [
      tx({ kind: 'income', amount: 300000 }),
      tx({ accountId: 'card', amount: 5000 }), // purchase on the card
      tx({ kind: 'transfer', accountId: 'card', toAccountId: 'pasmo', amount: 3000, topUp: true }),
      tx({ accountId: 'pasmo', amount: 178 }), // a train ride
      tx({ kind: 'transfer', accountId: 'bank', toAccountId: 'card', amount: 20000 }), // card payment
      tx({ accountId: 'card', amount: 1990, refund: true }),
      tx({ kind: 'adjustment', accountId: 'bank', amount: -12 }),
      tx({ accountId: 'bank', amount: 999, deleted: true }),
      tx({ accountId: 'bank', amount: 999, date: '2026-09-30' }), // before the opening date
    ];
    const b = balances(accounts, txs);
    expect(b.get('bank')).toBe(100000 + 300000 - 20000 - 12);
    expect(b.get('card')).toBe(-20000 - 5000 - 3000 + 20000 + 1990);
    expect(b.get('pasmo')).toBe(500 + 3000 - 178);
  });

  it('uses the received amount for transfers between currencies', () => {
    const usd = acct('usd', { currency: 'USD' });
    const b = balances([acct('bank'), usd], [tx({ kind: 'transfer', accountId: 'bank', toAccountId: 'usd', amount: 150000, toAmount: 100321 })]);
    expect(b.get('bank')).toBe(-150000);
    expect(b.get('usd')).toBe(100321);
  });
});

describe('totals', () => {
  it('counts spending by category; transfers never count; refunds and splits do', () => {
    const txs = [
      tx({ amount: 1000, categoryId: 'food' }),
      tx({ amount: 500, categoryId: 'food', refund: true }),
      tx({ amount: 3000, splits: [{ categoryId: 'food', amount: 1000 }, { categoryId: 'home', amount: 2000 }] }),
      tx({ kind: 'transfer', toAccountId: 'x', amount: 9999 }),
      tx({ kind: 'income', amount: 400000 }),
      tx({ amount: 7777, date: '2026-11-01', categoryId: 'food' }),
    ];
    const t = totals(txs, '2026-10-01', '2026-10-31');
    expect(t.spent).toBe(1000 - 500 + 3000);
    expect(t.income).toBe(400000);
    expect(t.byCategory.get('food')).toBe(1500);
    expect(t.byCategory.get('home')).toBe(2000);
  });
});
