// Budgets, the payday month and goals. Pure functions over the data so they can be tested.
import { dueDates } from './bills';
import { committed, nextBill } from './card';
import { totals } from './ledger';
import type { Account, Bill, Budget, Goal, Statement, Transaction } from './types';
import { addMonths, weekday } from './util';

const lastDay = (month: string) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
export const monthEnd = (month: string) => `${month}-${String(lastDay(month)).padStart(2, '0')}`;

/** The budget amount for a month: the latest change made on or before it. */
export function budgetFor(b: Budget, month: string): number | undefined {
  let out: number | undefined;
  for (const a of b.amounts) if (a.from <= month) out = a.amount;
  return out;
}

/** Sets the amount from a month on (replacing a change made for that same month). */
export function setBudget(b: Budget, month: string, amount: number): Budget {
  const amounts = [...b.amounts.filter((a) => a.from !== month), { from: month, amount }].sort((x, y) => x.from.localeCompare(y.from));
  return { ...b, amounts };
}

export interface BudgetLine {
  categoryId: string;
  budget: number;
  spent: number;
}

export function budgetLines(budgets: Budget[], txs: Transaction[], month: string, accountIds?: Set<string>): BudgetLine[] {
  const t = totals(txs, `${month}-01`, monthEnd(month), accountIds);
  const out: BudgetLine[] = [];
  for (const b of budgets) {
    if (b.deleted) continue;
    const budget = budgetFor(b, month);
    if (budget === undefined || budget <= 0) continue;
    out.push({ categoryId: b.categoryId, budget, spent: t.byCategory.get(b.categoryId) ?? 0 });
  }
  return out;
}

/** Where you'd expect to be on a day of the month: an even share of the budget (0..1). */
export function pace(month: string, today: string): number {
  if (today < `${month}-01`) return 0;
  if (today > monthEnd(month)) return 1;
  return +today.slice(8, 10) / lastDay(month);
}

/** Payday: the month's last business day (Friday when it ends on a weekend), as in your sheet. */
export function payday(month: string): string {
  let d = lastDay(month);
  let date = `${month}-${String(d).padStart(2, '0')}`;
  while (weekday(date) > 4) date = `${month}-${String(--d).padStart(2, '0')}`;
  return date;
}

export interface PlanItem {
  name: string;
  amount: number;
  date?: string;
  kind: 'bill' | 'card' | 'planned';
  estimate?: boolean;
  id?: string; // bill id, or card account id
}

export interface MonthPlan {
  month: string;
  salaryDate: string; // paid at the end of the month before
  salary: number;
  salaryExpected: boolean; // not received yet: last salary used
  items: PlanItem[];
  out: number;
  left: number;
}

/**
 * A payday month, like the spreadsheet: the salary paid at the end of the month before,
 * then what goes out during the month (bills paid from bank or cash, card withdrawals,
 * planned amounts such as cash or a fund), and what's left to save.
 * Bills paid with a card aren't listed: they are part of the card's withdrawal.
 */
export function monthPlan(
  month: string,
  data: { accounts: Account[]; bills: Bill[]; statements: Statement[]; transactions: Transaction[] },
  salaryCategoryIds: Set<string>,
  today: string,
): MonthPlan {
  const prev = addMonths(month, -1);
  const salaryDate = payday(prev);
  // Salary received around that payday (from the 20th of the month before to the 19th of this one).
  const isSalary = (t: Transaction) => !t.deleted && t.kind === 'income' && !!t.categoryId && salaryCategoryIds.has(t.categoryId);
  const received = data.transactions.filter((t) => isSalary(t) && t.date >= `${prev}-20` && t.date <= `${month}-19`);
  let salary = received.reduce((s, t) => s + t.amount, 0);
  let salaryExpected = false;
  if (!received.length) {
    const last = data.transactions.filter(isSalary).sort((a, b) => b.date.localeCompare(a.date))[0];
    salary = last?.amount ?? 0;
    salaryExpected = true;
  }

  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const items: PlanItem[] = [];
  for (const b of data.bills) {
    if (b.deleted || byId.get(b.accountId)?.type === 'card') continue;
    for (const date of dueDates(b, `${month}-01`, monthEnd(month))) {
      items.push({ name: b.name, amount: b.amount, date, kind: b.auto ? 'bill' : 'planned', id: b.id });
    }
  }
  for (const card of data.accounts.filter((a) => a.type === 'card' && !a.closed && !a.deleted)) {
    const mine = data.statements.filter((s) => s.accountId === card.id && !s.deleted).sort((a, b) => a.billMonth.localeCompare(b.billMonth));
    const exact = mine.find((s) => s.billMonth === month);
    if (exact) {
      items.push({ name: card.name, amount: exact.total, date: exact.payDate, kind: 'card', id: card.id });
      continue;
    }
    const next = nextBill(card, data.statements, data.transactions, today);
    if (next.billMonth === month) {
      items.push({ name: card.name, amount: next.total, date: next.payDate, kind: 'card', estimate: true, id: card.id });
    } else if (month > next.billMonth) {
      const known = committed(mine.at(-1)).get(month)?.total ?? 0;
      items.push({ name: `${card.name} (分割 so far)`, amount: known, kind: 'card', estimate: true, id: card.id });
    }
  }
  items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const out = items.reduce((s, i) => s + i.amount, 0);
  return { month, salaryDate, salary, salaryExpected, items, out, left: salary - out };
}

export interface GoalProgress {
  saved: number;
  pct: number;
  perMonth?: number; // to reach the target by the date
  monthsLeft?: number;
}

export function goalProgress(g: Goal, balance: number | undefined, today: string): GoalProgress {
  const saved = g.accountId && balance !== undefined ? balance : (g.saved ?? 0);
  const pct = g.target > 0 ? Math.min(100, Math.max(0, (saved / g.target) * 100)) : 0;
  if (!g.by) return { saved, pct };
  const now = today.slice(0, 7);
  const monthsLeft = Math.max(0, (+g.by.slice(0, 4) - +now.slice(0, 4)) * 12 + (+g.by.slice(5, 7) - +now.slice(5, 7)));
  const rest = Math.max(0, g.target - saved);
  return { saved, pct, monthsLeft, perMonth: monthsLeft > 0 ? Math.ceil(rest / monthsLeft) : rest };
}

export interface GoalGroup {
  accountId?: string; // undefined: a goal you record yourself (a group of one)
  goals: { goal: Goal; progress: GoalProgress }[];
  target: number; // the targets added up
  saved: number; // the account's balance (or the amount recorded)
  pct: number;
}

/**
 * Goals saved in the same account share its balance: the group compares the balance with all
 * their targets added up, and each goal gets a share, earliest target date first (goals without
 * a date last). Reached goals are left out, so their money isn't counted again.
 */
export function goalGroups(goals: Goal[], balanceOf: (accountId: string) => number, today: string): GoalGroup[] {
  const open = goals.filter((g) => !g.deleted && !g.done);
  const groups: GoalGroup[] = [];
  const byAccount = new Map<string, Goal[]>();
  for (const g of open) {
    if (!g.accountId) {
      const progress = goalProgress(g, undefined, today);
      groups.push({ goals: [{ goal: g, progress }], target: g.target, saved: progress.saved, pct: progress.pct });
    } else byAccount.set(g.accountId, [...(byAccount.get(g.accountId) ?? []), g]);
  }
  for (const [accountId, list] of byAccount) {
    const balance = balanceOf(accountId);
    const target = list.reduce((s, g) => s + g.target, 0);
    const ordered = [...list].sort((a, b) => (a.by ?? '9999-99').localeCompare(b.by ?? '9999-99') || a.createdAt.localeCompare(b.createdAt));
    let left = Math.max(0, balance);
    const items = ordered.map((g, i) => {
      // The last goal also gets anything beyond the targets, so the shares add up to the balance.
      const share = i === ordered.length - 1 ? left : Math.min(left, g.target);
      left -= share;
      return { goal: g, progress: goalProgress({ ...g, accountId: undefined, saved: share }, undefined, today) };
    });
    groups.push({ accountId, goals: items, target, saved: balance, pct: target > 0 ? Math.min(100, Math.max(0, (balance / target) * 100)) : 0 });
  }
  return groups;
}
