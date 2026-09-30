// CSV export of transactions, for spreadsheets (Excel and Numbers open it with Japanese intact).
import { formatMoney, toInput } from './money';
import type { Account, Category, Transaction } from './types';

const cell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

interface Lookup {
  account(id: string | undefined): Account | undefined;
  category(id: string | undefined): Category | undefined;
}

export const CSV_HEADER = ['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Received', 'Category', 'Payee', 'Note', 'Refund', 'Paid in dollars'];

export function transactionsCsv(txs: Transaction[], lookup: Lookup): string {
  const rows = [CSV_HEADER];
  for (const t of txs) {
    if (t.deleted) continue;
    const a = lookup.account(t.accountId);
    const to = lookup.account(t.toAccountId);
    const currency = a?.currency ?? 'JPY';
    const category = t.splits?.length
      ? t.splits.map((s) => `${lookup.category(s.categoryId)?.name ?? '?'} ${toInput(s.amount, currency)}`).join(' + ')
      : (lookup.category(t.categoryId)?.name ?? '');
    rows.push([
      t.date,
      t.kind === 'transfer' && t.topUp ? 'top-up' : t.kind,
      toInput(t.amount, currency),
      currency,
      a?.name ?? '',
      to?.name ?? '',
      t.toAmount !== undefined && to ? toInput(t.toAmount, to.currency) : '',
      category,
      t.payee ?? '',
      t.note ?? '',
      t.refund ? 'yes' : '',
      t.foreign ? `${formatMoney(t.foreign.amount, t.foreign.currency)}${t.foreign.estimated ? ' (estimated yen)' : ''}` : '',
    ]);
  }
  // A byte-order mark so Excel reads it as UTF-8.
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
