// Credit card (Rakuten) statements: instalment schedule, next withdrawal, and the
// withdrawals added by themselves. Rakuten bills a calendar month's purchases on the
// 27th of the next month (next business day when that's a weekend).
import { effects } from './ledger';
import { remainingPayments, type ParsedStatement } from './import/rakuten';
import type { Account, InstalmentRow, Statement, Transaction } from './types';
import { addDays, addMonths, weekday } from './util';

export const PAY_DAY = 27;

export const statementId = (accountId: string, billMonth: string) => `stmt-${accountId}-${billMonth}`;
export const withdrawalId = (statementId: string) => `pay:${statementId}`;

/** The withdrawal date for a bill month: the 27th, moved to Monday when it falls on a weekend. */
export function payDateFor(billMonth: string): string {
  let d = `${billMonth}-${PAY_DAY}`;
  while (weekday(d) > 4) d = addDays(d, 1);
  return d;
}

export function toStatement(p: ParsedStatement, accountId: string, now: string, fileName?: string): Statement {
  const plans: InstalmentRow[] = p.lines
    .filter((l) => l.kind === 'instalment')
    .map((l) => ({ date: l.date, shop: l.shop, count: l.count!, nth: l.nth!, purchase: l.purchase ?? 0, fee: l.fee, pay: l.pay, carry: l.carry }));
  const instalments = plans.reduce((s, r) => s + r.pay, 0);
  const other = p.lines.filter((l) => l.kind === 'other').reduce((s, l) => s + l.pay, 0);
  // One-time payments = the rest of the bill. (Purchases switched to 分割 after the statement
  // closed are still printed as 1回払い, but aren't in the total.)
  const once = Math.max(0, p.total - instalments - other);
  return {
    id: statementId(accountId, p.billMonth),
    createdAt: now,
    updatedAt: now,
    accountId,
    billMonth: p.billMonth,
    payDate: p.payDate,
    total: p.total,
    once,
    instalments,
    other,
    plans,
    fileName,
  };
}

export interface PlanPayment {
  shop: string;
  date: string;
  amount: number;
  nth: number;
  count: number;
}

/** Instalments still to come after a statement, by bill month. */
export function committed(s: Statement | undefined): Map<string, { total: number; payments: PlanPayment[] }> {
  const out = new Map<string, { total: number; payments: PlanPayment[] }>();
  if (!s) return out;
  for (const p of s.plans) {
    remainingPayments(p.carry, p.count - p.nth).forEach((amount, i) => {
      const month = addMonths(s.billMonth, i + 1);
      const m = out.get(month) ?? { total: 0, payments: [] };
      m.total += amount;
      m.payments.push({ shop: p.shop, date: p.date, amount, nth: p.nth + i + 1, count: p.count });
      out.set(month, m);
    });
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

/** Money that left the card account in a date range (purchases, top-ups, subscriptions), minus refunds. */
export function cardSpending(accountId: string, txs: Transaction[], from: string, to: string): number {
  let sum = 0;
  for (const t of txs) {
    if (t.deleted || t.date < from || t.date > to || t.statementId) continue;
    for (const [id, delta] of effects(t)) {
      if (id !== accountId) continue;
      // Payments into the card (from the bank) aren't spending.
      if (t.kind === 'transfer' && t.toAccountId === accountId) continue;
      sum -= delta;
    }
  }
  return sum;
}

export interface NextBill {
  billMonth: string;
  payDate: string;
  once: number; // purchases you entered for that month
  instalments: number; // from plans already known
  total: number;
  /** Purchases before the card's starting date aren't in the app, so the estimate may be low. */
  partial: boolean;
}

/** The next withdrawal that has no statement yet, estimated from your entries and known plans. */
export function nextBill(card: Account, statements: Statement[], txs: Transaction[], today: string): NextBill {
  const mine = statements.filter((s) => s.accountId === card.id && !s.deleted).sort((a, b) => a.billMonth.localeCompare(b.billMonth));
  const latest = mine.at(-1);
  // The first bill month without a statement, but never one already paid.
  let billMonth = today.slice(8, 10) > String(PAY_DAY) ? addMonths(today.slice(0, 7), 1) : today.slice(0, 7);
  if (latest && latest.billMonth >= billMonth) billMonth = addMonths(latest.billMonth, 1);
  const purchaseMonth = addMonths(billMonth, -1);
  const once = cardSpending(card.id, txs, `${purchaseMonth}-01`, `${purchaseMonth}-31`);
  const instalments = committed(latest).get(billMonth)?.total ?? 0;
  return {
    billMonth,
    payDate: payDateFor(billMonth),
    once,
    instalments,
    total: once + instalments,
    partial: card.openingDate > `${purchaseMonth}-01`,
  };
}

/**
 * Statement withdrawals due by today that aren't recorded yet: a transfer from the paying
 * account to the card on the pay date (fixed id, so it is never added twice).
 */
export function dueWithdrawals(cards: Account[], statements: Statement[], existingIds: Set<string>, today: string, now: string): Transaction[] {
  const out: Transaction[] = [];
  for (const s of statements) {
    const card = cards.find((c) => c.id === s.accountId);
    if (s.deleted || !card?.paysFromId || s.payDate > today || s.payDate < card.openingDate) continue;
    const id = withdrawalId(s.id);
    if (existingIds.has(id)) continue;
    out.push({
      id, createdAt: now, updatedAt: now, date: s.payDate, kind: 'transfer', accountId: card.paysFromId, toAccountId: card.id,
      amount: s.total, payee: `${card.name} ${+s.billMonth.slice(5, 7)}月 withdrawal`, statementId: s.id,
    });
  }
  return out;
}

/** Dollar purchases whose yen amount was estimated: the statement's real amount, when a row matches. */
export function matchEstimates(p: ParsedStatement, cardId: string, txs: Transaction[]): { tx: Transaction; amount: number }[] {
  const rows = p.lines.filter((l) => l.kind === 'once' && l.amount);
  const used = new Set<number>();
  const out: { tx: Transaction; amount: number }[] = [];
  for (const t of txs) {
    if (t.deleted || t.accountId !== cardId || !t.foreign?.estimated) continue;
    let best = -1;
    let bestDiff = Infinity;
    rows.forEach((r, i) => {
      const days = Math.abs(Date.parse(r.date) - Date.parse(t.date)) / 86_400_000;
      const diff = Math.abs(r.amount! - t.amount) / t.amount;
      if (!used.has(i) && days <= 4 && diff <= 0.1 && diff < bestDiff) {
        best = i;
        bestDiff = diff;
      }
    });
    if (best >= 0) {
      used.add(best);
      out.push({ tx: t, amount: rows[best].amount! });
    }
  }
  return out;
}
