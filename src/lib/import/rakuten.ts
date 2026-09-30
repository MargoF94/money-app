// Reads a Rakuten Card 明細 (ご利用代金請求明細書). Input: the statement's text as rows of cells
// (see pdfText.ts). Every purchase row has 10 cells:
// 利用日 | 利用店名 | 利用者 | 支払方法 | 利用金額 | 手数料/利息 | 支払総額 | 当月支払額 | 当月請求額 | 翌月繰越残高
// For an ongoing plan 利用金額 is "-" and the purchase amount is on a following "購入金額：¥…" line.

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
