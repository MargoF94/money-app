// Subscriptions and regular bills: due dates, and the payments to add by themselves.
import type { Bill, Transaction } from './types';
import { addMonths } from './util';

const lastDay = (month: string) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();

/** The due date in a month: the start's day, or the month's last day when shorter (31 → 30 Apr, 28/29 Feb). */
function dayIn(month: string, day: number): string {
  return `${month}-${String(Math.min(day, lastDay(month))).padStart(2, '0')}`;
}

/** Every due date of a bill between two dates (inclusive), in order. */
export function dueDates(bill: Bill, from: string, to: string): string[] {
  const out: string[] = [];
  const step = bill.repeat === 'yearly' ? 12 : Math.max(1, bill.every ?? 1);
  const day = +bill.start.slice(8, 10);
  const last = bill.end && bill.end < to ? bill.end : to;
  for (let month = bill.start.slice(0, 7), i = 0; i < 1200; i++, month = addMonths(month, step)) {
    const date = dayIn(month, day);
    if (date > last) break;
    if (date >= from && date >= bill.start) out.push(date);
  }
  return out;
}

export function nextDue(bill: Bill, today: string): string | undefined {
  return dueDates(bill, today, addMonths(today.slice(0, 7), 13) + '-31')[0];
}

export const billTxId = (billId: string, date: string) => `bill:${billId}:${date}`;

/**
 * Payments due up to today that haven't been added yet. An id already present — even as a
 * deleted record — is skipped, so a payment you deleted by hand isn't added again.
 */
export function duePayments(bills: Bill[], existingIds: Set<string>, today: string, now: string): Transaction[] {
  const out: Transaction[] = [];
  for (const b of bills) {
    if (b.deleted || !b.auto) continue;
    for (const date of dueDates(b, b.start, today)) {
      const id = billTxId(b.id, date);
      if (existingIds.has(id)) continue;
      out.push({
        id, createdAt: now, updatedAt: now, date, kind: 'expense', accountId: b.accountId, amount: b.amount,
        categoryId: b.categoryId, payee: b.name, billId: b.id, billDate: date,
      });
    }
  }
  return out;
}

/** What a bill costs per month and per year, for the totals. */
export function monthlyCost(b: Bill): number {
  return b.repeat === 'yearly' ? b.amount / 12 : b.amount / Math.max(1, b.every ?? 1);
}

export function repeatLabel(b: Bill): string {
  const day = +b.start.slice(8, 10);
  const nth = day >= 29 ? `${day}th (or the month's last day)` : `${day}${[, 'st', 'nd', 'rd'][day % 10 > 3 || Math.floor(day / 10) === 1 ? 0 : day % 10] ?? 'th'}`;
  if (b.repeat === 'yearly') return `Every year on ${+b.start.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+b.start.slice(5, 7) - 1]}`;
  const every = b.every && b.every > 1 ? `Every ${b.every} months` : 'Every month';
  return `${every} on the ${nth}`;
}
