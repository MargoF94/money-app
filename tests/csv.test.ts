import { describe, expect, it } from 'vitest';
import { transactionsCsv } from '../src/lib/csv';
import type { Account, Category, Transaction } from '../src/lib/types';

const accounts: Record<string, Account> = {
  card: { id: 'card', createdAt: '', updatedAt: '', name: 'Rakuten Card', type: 'card', currency: 'JPY', opening: 0, openingDate: '', order: 0 },
  pasmo: { id: 'pasmo', createdAt: '', updatedAt: '', name: 'PASMO', type: 'prepaid', currency: 'JPY', opening: 0, openingDate: '', order: 0 },
};
const cats: Record<string, Category> = { food: { id: 'food', createdAt: '', updatedAt: '', name: 'Groceries', kind: 'expense', icon: 'cart', order: 0 } };
const lookup = { account: (id?: string) => (id ? accounts[id] : undefined), category: (id?: string) => (id ? cats[id] : undefined) };
const tx = (extra: Partial<Transaction>): Transaction => ({ id: 'x', createdAt: '', updatedAt: '', date: '2026-10-01', kind: 'expense', accountId: 'card', amount: 0, ...extra });

describe('CSV export', () => {
  it('writes one row per transaction, quoting where needed', () => {
    const csv = transactionsCsv(
      [
        tx({ amount: 1540, categoryId: 'food', payee: 'ローソン', note: 'milk, eggs' }),
        tx({ kind: 'transfer', toAccountId: 'pasmo', amount: 3000, topUp: true }),
        tx({ amount: 1524, foreign: { amount: 1000, currency: 'USD', estimated: true }, payee: 'App "Store"' }),
        tx({ amount: 5, deleted: true }),
      ],
      lookup,
    );
    const lines = csv.slice(1).trim().split('\r\n');
    expect(csv.startsWith('﻿Date,Type,Amount')).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('2026-10-01,expense,1540,JPY,Rakuten Card,,,Groceries,ローソン,"milk, eggs",,');
    expect(lines[2]).toBe('2026-10-01,top-up,3000,JPY,Rakuten Card,PASMO,,,,,,');
    expect(lines[3]).toContain('"App ""Store"""');
    expect(lines[3]).toContain('$10.00 (estimated yen)');
  });
});
