import { describe, expect, it } from 'vitest';
import { budgetFor, budgetLines, goalProgress, monthPlan, pace, payday, setBudget } from '../src/lib/plan';
import type { Account, Bill, Budget, Transaction } from '../src/lib/types';

const acct = (id: string, extra: Partial<Account> = {}): Account => ({
  id, createdAt: '', updatedAt: '', name: id, type: 'bank', currency: 'JPY', opening: 0, openingDate: '2026-09-01', order: 0, ...extra,
});
let n = 0;
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, createdAt: '', updatedAt: '', date: '2026-10-05', kind: 'expense', accountId: 'bank', amount: 0, ...extra,
});
const bill = (extra: Partial<Bill>): Bill => ({
  id: `b${n++}`, createdAt: '', updatedAt: '', name: 'x', amount: 0, accountId: 'bank', repeat: 'monthly', start: '2026-09-01', auto: true, ...extra,
});

describe('budgets', () => {
  it('keep older months when the amount changes', () => {
    let b: Budget = { id: 'x', createdAt: '', updatedAt: '', categoryId: 'food', amounts: [] };
    b = setBudget(b, '2026-09', 40000);
    b = setBudget(b, '2026-11', 45000);
    expect([budgetFor(b, '2026-08'), budgetFor(b, '2026-10'), budgetFor(b, '2026-12')]).toEqual([undefined, 40000, 45000]);
    b = setBudget(b, '2026-11', 50000);
    expect(b.amounts).toHaveLength(2);
  });

  it('compare spending with the budget, and pace through the month', () => {
    const b: Budget = { id: 'x', createdAt: '', updatedAt: '', categoryId: 'food', amounts: [{ from: '2026-10', amount: 30000 }] };
    const lines = budgetLines([b], [tx({ categoryId: 'food', amount: 12000 }), tx({ categoryId: 'food', amount: 999, date: '2026-09-30' })], '2026-10');
    expect(lines).toEqual([{ categoryId: 'food', budget: 30000, spent: 12000 }]);
    expect(pace('2026-10', '2026-10-31')).toBe(1);
    expect(pace('2026-10', '2026-09-30')).toBe(0);
    expect(pace('2026-10', '2026-10-15')).toBeCloseTo(15 / 31);
  });
});

describe('payday month', () => {
  it('pays on the last business day of the month before', () => {
    expect(payday('2026-09')).toBe('2026-09-30'); // Wednesday
    expect(payday('2026-10')).toBe('2026-10-30'); // 31st is a Saturday
    expect(payday('2026-05')).toBe('2026-05-29'); // 31st is a Sunday
  });

  it('lists salary, bills from the bank, the card withdrawal and what is left', () => {
    const accounts = [acct('bank'), acct('card', { type: 'card', paysFromId: 'bank' })];
    const bills = [
      bill({ name: 'Rent', amount: 70000, start: '2026-09-27' }),
      bill({ name: 'Paidy', amount: 3328, start: '2026-09-27', end: '2026-10-27' }),
      bill({ name: 'Cash', amount: 10000, start: '2026-09-01', auto: false }),
      bill({ name: 'Netflix', amount: 1590, accountId: 'card', start: '2026-09-21' }), // inside the card bill
    ];
    const transactions = [
      tx({ kind: 'income', categoryId: 'salary', amount: 424615, date: '2026-09-30' }),
      tx({ accountId: 'card', amount: 150000, date: '2026-09-10' }),
    ];
    const p = monthPlan('2026-10', { accounts, bills, statements: [], transactions }, new Set(['salary']), '2026-09-30');
    expect([p.salaryDate, p.salary, p.salaryExpected]).toEqual(['2026-09-30', 424615, false]);
    expect(p.items.map((i) => [i.name, i.amount, i.kind])).toEqual([
      ['Cash', 10000, 'planned'],
      ['Rent', 70000, 'bill'],
      ['Paidy', 3328, 'bill'],
      ['card', 150000, 'card'],
    ]);
    expect(p.left).toBe(424615 - 233328);
    const nov = monthPlan('2026-11', { accounts, bills, statements: [], transactions }, new Set(['salary']), '2026-09-30');
    expect([nov.salary, nov.salaryExpected]).toEqual([424615, true]);
    expect(nov.items.map((i) => i.name)).toEqual(['Cash', 'Rent', 'card (分割 so far)']);
  });
});

describe('goals', () => {
  it('shows progress and what to save each month', () => {
    const g = { id: 'g', createdAt: '', updatedAt: '', name: 'Trip', target: 300000, by: '2027-02' };
    expect(goalProgress({ ...g, saved: 180000 }, undefined, '2026-09-30')).toEqual({ saved: 180000, pct: 60, monthsLeft: 5, perMonth: 24000 });
    expect(goalProgress({ ...g, accountId: 'sav', by: undefined }, 150000, '2026-09-30')).toEqual({ saved: 150000, pct: 50 });
  });
});
