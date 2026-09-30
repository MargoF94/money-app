// Statistics for the Stats page. Pure functions over the data so they can be tested.
// Yen accounts only (dollar accounts are listed in Accounts but not mixed into yen totals).
import { balances, spendingParts } from './ledger';
import { monthEnd } from './plan';
import type { Account, Transaction } from './types';
import { addMonths } from './util';

export interface Period {
  from?: string; // YYYY-MM-DD inclusive; undefined = from the start
  to?: string; // YYYY-MM-DD inclusive; undefined = up to today
}

export type PresetId = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'last-12' | 'all';

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'last-12', label: 'Last 12 months' },
  { id: 'all', label: 'All time' },
];

export function presetPeriod(id: PresetId, today: string): Period {
  const month = today.slice(0, 7);
  const y = +today.slice(0, 4);
  switch (id) {
    case 'this-month':
      return { from: `${month}-01`, to: monthEnd(month) };
    case 'last-month': {
      const m = addMonths(month, -1);
      return { from: `${m}-01`, to: monthEnd(m) };
    }
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'last-12':
      return { from: `${addMonths(month, -11)}-01`, to: monthEnd(month) };
    case 'all':
      return {};
  }
}

export interface MonthBucket {
  month: string;
  label: string;
  income: number;
  spent: number;
  netWorth: number; // at the end of the month (or today, for the current month)
}

export interface Stats {
  from: string;
  to: string;
  spent: number;
  income: number;
  saved: number;
  bills: number; // subscriptions and bills added from Plan
  perDay: number;
  days: number;
  byCategory: { id: string; value: number }[]; // biggest first, '' = no category
  payees: { name: string; value: number }[];
  months: MonthBucket[];
  biggest?: Transaction;
}

const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

export function computeStats(accounts: Account[], txs: Transaction[], period: Period, today: string): Stats {
  const yen = new Set(accounts.filter((a) => !a.deleted && a.currency === 'JPY').map((a) => a.id));
  const live = txs.filter((t) => !t.deleted && yen.has(t.accountId));
  const first = live.reduce((m, t) => (t.date < m ? t.date : m), today);
  const from = period.from ?? first;
  const end = period.to ?? today;
  const to = end > today ? today : end; // the future has nothing yet
  const inside = live.filter((t) => t.date >= from && t.date <= to);

  let spent = 0;
  let income = 0;
  let bills = 0;
  const cats = new Map<string, number>();
  const payees = new Map<string, { name: string; value: number }>();
  let biggest: Transaction | undefined;
  for (const t of inside) {
    if (t.kind === 'income') income += t.amount;
    const parts = spendingParts(t);
    for (const [cat, v] of parts) {
      spent += v;
      cats.set(cat ?? '', (cats.get(cat ?? '') ?? 0) + v);
    }
    if (parts.length) {
      if (t.billId) bills += t.refund ? -t.amount : t.amount;
      const name = t.payee?.trim();
      if (name) {
        const key = name.normalize('NFKC').toLowerCase();
        const p = payees.get(key) ?? { name, value: 0 };
        p.value += t.refund ? -t.amount : t.amount;
        payees.set(key, p);
      }
      if (!t.refund && (!biggest || t.amount > biggest.amount)) biggest = t;
    }
  }

  // Month by month (for the charts): whole months from the period's first to its last.
  const months: MonthBucket[] = [];
  const yenAccounts = accounts.filter((a) => yen.has(a.id));
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 120; m = addMonths(m, 1)) {
    const mFrom = `${m}-01`;
    const mTo = monthEnd(m) < to ? monthEnd(m) : to;
    let mi = 0;
    let ms = 0;
    for (const t of live) {
      if (t.date < mFrom || t.date > mTo) continue;
      if (t.kind === 'income') mi += t.amount;
      for (const [, v] of spendingParts(t)) ms += v;
    }
    const worth = [...balances(yenAccounts, live, mTo).values()].reduce((s, v) => s + v, 0);
    months.push({ month: m, label: LABELS[+m.slice(5, 7) - 1], income: mi, spent: ms, netWorth: worth });
  }
  // Across years, month labels need the year.
  if (months.length && months[0].month.slice(0, 4) !== months.at(-1)!.month.slice(0, 4)) {
    for (const b of months) if (b.month.endsWith('-01') || b === months[0]) b.label = `${b.label} ’${b.month.slice(2, 4)}`;
  }

  const days = Math.max(1, dayCount(from, to));
  return {
    from,
    to,
    spent,
    income,
    saved: income - spent,
    bills,
    perDay: Math.round(spent / days),
    days,
    byCategory: [...cats].map(([id, value]) => ({ id, value })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value),
    payees: [...payees.values()].filter((p) => p.value > 0).sort((a, b) => b.value - a.value),
    months,
    biggest,
  };
}

/**
 * The categories that keep their own colours in charts: the 5 you spent most on over the last
 * 12 months (so the colours don't change with the period you look at). Everything else is Other.
 */
export function pinnedCategories(txs: Transaction[], today: string, count = 5): string[] {
  const from = `${addMonths(today.slice(0, 7), -11)}-01`;
  const sums = new Map<string, number>();
  for (const t of txs) {
    if (t.deleted || t.date < from || t.date > today) continue;
    for (const [cat, v] of spendingParts(t)) if (cat) sums.set(cat, (sums.get(cat) ?? 0) + v);
  }
  return [...sums].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => id);
}

/** Compact yen for chart ticks: ¥800K, ¥1.2M. */
export function compactYen(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}¥${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1000) return `${sign}¥${Math.round(a / 1000)}K`;
  return `${sign}¥${Math.round(a)}`;
}
