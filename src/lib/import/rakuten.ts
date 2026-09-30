// Reads a Rakuten Card 明細 (ご利用代金請求明細書). Input: the statement's text as rows of cells
// (see pdfText.ts). Every purchase row has 10 cells:
// 利用日 | 利用店名 | 利用者 | 支払方法 | 利用金額 | 手数料/利息 | 支払総額 | 当月支払額 | 当月請求額 | 翌月繰越残高
// For an ongoing plan 利用金額 is "-" and the purchase amount is on a following "購入金額：¥…" line.

import { payDateFor } from '../card';

export interface StatementLine {
  date: string;
  shop: string;
  method: string; // as printed, e.g. "1回払い", "分割変更3回払い(2回目"
  kind: 'once' | 'instalment' | 'other';
  count?: number;
  nth?: number;
  amount?: number; // 利用金額 (undefined when "-")
  fee: number;
  total: number;
  pay: number; // 当月請求額
  carry: number; // 翌月繰越残高
  purchase?: number;
}

export interface ParsedStatement {
  billMonth: string; // YYYY-MM
  payDate: string;
  total: number;
  lines: StatementLine[];
}

const num = (s: string) => (s.trim() === '-' ? undefined : Number(s.normalize('NFKC').replace(/[,¥円\s]/g, '')));
const ymd = (s: string) => s.replace(/\//g, '-');

export function parseRakuten(rows: string[][]): ParsedStatement {
  let billMonth = '';
  let payDate = '';
  let total: number | undefined;
  const lines: StatementLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim());
    const text = cells.join(' ');
    const bm = text.match(/(\d{4})年(\d{2})月ご請求金額/);
    if (bm && !billMonth) {
      billMonth = `${bm[1]}-${bm[2]}`;
      const next = (rows[i + 1] ?? []).join(' ').match(/([\d,]+)円/);
      if (next) total = num(next[1]);
      continue;
    }
    if (!payDate && cells[1] === '口座振替' && /^\d{4}\/\d{2}\/\d{2}$/.test(cells[0])) {
      payDate = ymd(cells[0]);
      continue;
    }
    // A shop name can be split into several cells, so find the columns from the 利用者 cell (本人 / 家族).
    const who = cells.findIndex((c, j) => j >= 2 && /^(本人|家族)/.test(c));
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(cells[0]) && who > 1 && cells.length >= who + 8) {
      const [date] = cells;
      const shop = cells.slice(1, who).join(' ');
      const [method, amount, fee, tot, , pay, carry] = cells.slice(who + 1, who + 8);
      const plan = method.match(/(\d+)回払い\((\d+)回/);
      const line: StatementLine = {
        date: ymd(date),
        shop,
        method,
        kind: method.startsWith('1回') ? 'once' : plan ? 'instalment' : 'other',
        amount: num(amount),
        fee: num(fee) ?? 0,
        total: num(tot) ?? 0,
        pay: num(pay) ?? 0,
        carry: num(carry) ?? 0,
      };
      if (plan) {
        line.count = +plan[1];
        line.nth = +plan[2];
      }
      lines.push(line);
      continue;
    }
    // 購入金額：¥9,750 belongs to the last plan row.
    const p = text.normalize('NFKC').match(/購入金額:\s*[¥\\]([\d,]+)/);
    const last = lines.at(-1);
    if (p && last?.kind === 'instalment' && last.purchase === undefined) last.purchase = num(p[1]);
  }
  if (!billMonth || !payDate || total === undefined) {
    throw new Error('This doesn’t look like a Rakuten Card statement (ご利用代金請求明細書).');
  }
  for (const l of lines) if (l.kind === 'instalment' && l.purchase === undefined) l.purchase = l.amount ?? l.total - l.fee;
  return { billMonth, payDate, total, lines };
}

/** The instalments still to come for each plan: equal payments, any rounding in the first one. */
export function remainingPayments(carry: number, left: number): number[] {
  if (left <= 0 || carry <= 0) return [];
  const each = Math.floor(carry / left);
  return [carry - each * (left - 1), ...Array(left - 1).fill(each)];
}

// ---- e-NAVI CSV --------------------------------------------------------------------------
// The CSV from ご利用明細 (the current month, before the 明細 PDF exists). Columns:
// 利用日 | 利用店名・商品名 | 利用者 | 支払方法 | 利用金額 | 手数料/利息 | 支払総額 | 支払月 | M月支払金額 | 当月請求額 | 翌月繰越残高 | 以降請求額
// Rows whose 支払月 is "M月" make up the bill; "M+1月以降" rows repeat a plan's later payments.

/** Text of the file: UTF-8 (with or without BOM), or Shift_JIS for older exports. */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buffer);
  }
}

/** Rows of cells; handles quotes, doubled quotes and commas or line breaks inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** "ＶＩＳＡ国内利用　VS ﾛｰｿﾝ" → "ﾛｰｿﾝ", "返済方法変更ＷＥＢ　103645ﾊﾞﾝﾋﾞｴﾝ" → "ﾊﾞﾝﾋﾞｴﾝ". */
function cleanShop(s: string): string {
  const n = s.normalize('NFKC').trim();
  return n
    .replace(/^返済方法変更WEB\s*\d*/, '')
    .replace(/^(VISA|JCB|MASTER|Mastercard|AMEX)(国内|海外)利用\s*(VS|QP|ID)?\s+/i, '')
    .trim() || n;
}

export function parseRakutenCsv(text: string): ParsedStatement {
  const rows = csvRows(text);
  const head = (rows[0] ?? []).map((c) => c.trim());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const c = {
    date: col(/^利用日/),
    shop: col(/^利用店名/),
    method: col(/^支払方法/),
    amount: col(/^利用金額/),
    fee: col(/^手数料/),
    total: col(/^支払総額/),
    month: col(/^支払月/),
    pay: col(/^当月請求額/),
    carry: col(/繰越残高/),
  };
  const due = head.map((h) => h.match(/^(\d{1,2})月支払金額/)).find(Boolean);
  if (!due || Object.values(c).some((i) => i < 0)) {
    throw new Error('This doesn’t look like the ご利用明細 CSV from Rakuten e-NAVI.');
  }
  const m = +due[1];
  const lines: StatementLine[] = [];
  let latest = '';
  for (const r of rows.slice(1)) {
    const cell = (i: number) => (r[i] ?? '').trim();
    const date = cell(c.date);
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
      // 購入金額：\3500 / 分割変更金額：\3500 belongs to the last plan row.
      const p = r.join(' ').normalize('NFKC').match(/購入金額:\s*[¥\\]([\d,]+)/);
      const last = lines.at(-1);
      if (p && last?.kind === 'instalment' && last.purchase === undefined) last.purchase = num(p[1]);
      continue;
    }
    if (date > latest) latest = date;
    if (cell(c.month) !== `${m}月`) continue;
    const method = cell(c.method);
    const plan = method.match(/(\d+)回払い\((\d+)回/);
    const line: StatementLine = {
      date: ymd(date),
      shop: cleanShop(cell(c.shop)),
      method,
      kind: method.startsWith('1回') ? 'once' : plan ? 'instalment' : 'other',
      amount: num(cell(c.amount) || '-'),
      fee: num(cell(c.fee) || '0') ?? 0,
      total: num(cell(c.total) || '0') ?? 0,
      pay: num(cell(c.pay) || '0') ?? 0,
      carry: num(cell(c.carry) || '0') ?? 0,
    };
    if (plan) {
      line.count = +plan[1];
      line.nth = +plan[2];
    }
    lines.push(line);
  }
  if (!lines.length) throw new Error('No payments for the bill were found in this CSV.');
  // The bill month is the first month named `m` after the latest purchase.
  let [y, mo] = latest.split('/').map(Number);
  do {
    mo++;
    if (mo > 12) (mo = 1), y++;
  } while (mo !== m);
  const billMonth = `${y}-${String(m).padStart(2, '0')}`;
  for (const l of lines) if (l.kind === 'instalment' && l.purchase === undefined) l.purchase = l.amount ?? l.total - l.fee;
  const total = lines.reduce((s, l) => s + l.pay, 0);
  return { billMonth, payDate: payDateFor(billMonth), total, lines };
}
