// Balances and totals, computed from transactions (never stored).
import type { Account, Transaction } from './types';

/** How a transaction changes each account it touches, in that account's own currency. */
export function effects(t: Transaction): [string, number][] {
  if (t.deleted) return [];
  switch (t.kind) {
    case 'expense':
      return [[t.accountId, t.refund ? t.amount : -t.amount]];
    case 'income':
      return [[t.accountId, t.amount]];
    case 'adjustment':
      return [[t.accountId, t.amount]];
    case 'transfer':
      return t.toAccountId ? [[t.accountId, -t.amount], [t.toAccountId, t.toAmount ?? t.amount]] : [[t.accountId, -t.amount]];
  }
}

/**
 * Current balance of every account: its opening balance (at the start of its opening date)
 * plus every transaction on or after that date. Cards and loans owed are negative.
 */
export function balances(accounts: Account[], txs: Transaction[], upTo?: string): Map<string, number> {
  const out = new Map<string, number>();
  const start = new Map<string, string>();
  for (const a of accounts) {
    if (a.deleted) continue;
    out.set(a.id, a.opening);
    start.set(a.id, a.openingDate);
  }
  for (const t of txs) {
    if (t.deleted || (upTo && t.date > upTo)) continue;
    for (const [id, delta] of effects(t)) {
      const from = start.get(id);
      if (from !== undefined && t.date >= from) out.set(id, (out.get(id) ?? 0) + delta);
    }
  }
  return out;
}

/** Signed spending per category: refunds reduce it. Split transactions count in each part's category. */
export function spendingParts(t: Transaction): [string | undefined, number][] {
  if (t.deleted || t.kind !== 'expense') return [];
  const sign = t.refund ? -1 : 1;
  if (t.splits?.length) return t.splits.map((s) => [s.categoryId, sign * s.amount]);
  return [[t.categoryId, sign * t.amount]];
}

export interface Totals {
  spent: number;
  income: number;
  byCategory: Map<string, number>; // '' = no category
}

/** Spending and income of yen transactions in a date range (inclusive). Transfers never count. */
export function totals(txs: Transaction[], from: string, to: string, accountIds?: Set<string>): Totals {
  const byCategory = new Map<string, number>();
  let spent = 0;
  let income = 0;
  for (const t of txs) {
    if (t.deleted || t.date < from || t.date > to) continue;
    if (accountIds && !accountIds.has(t.accountId)) continue;
    if (t.kind === 'income') income += t.amount;
    for (const [cat, v] of spendingParts(t)) {
      spent += v;
      byCategory.set(cat ?? '', (byCategory.get(cat ?? '') ?? 0) + v);
    }
  }
  return { spent, income, byCategory };
}

/** Amount this transaction shows in a list for a given account (negative = money out of it). */
export function amountFor(t: Transaction, accountId?: string): number {
  const eff = effects(t);
  if (accountId) return eff.find(([id]) => id === accountId)?.[1] ?? 0;
  return eff[0]?.[1] ?? 0;
}
