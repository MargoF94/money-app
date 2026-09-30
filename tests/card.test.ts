import { describe, expect, it } from 'vitest';
import { committed, dueWithdrawals, matchEstimates, nextBill, payDateFor, toStatement } from '../src/lib/card';
import { parseRakuten, remainingPayments } from '../src/lib/import/rakuten';
import type { Account, Transaction } from '../src/lib/types';

// Synthetic rows shaped like a Rakuten statement read by pdfText.ts (no real data).
const HEAD = ['利用日', '利用店名', '利用者', '支払方法', '利用金額', '手数料/利息', '支払総額', '当月支払額', '当月請求額', '翌月繰越残高'];
const rows: string[][] = [
  ['ご利用代金請求明細書'],
  ['2026年09月ご請求金額', 'ご利用カード'],
  ['20,735円', '楽天カード（Visa）'],
  ['お支払日', '返済方法', '引落口座'],
  ['2026/09/28', '口座振替', '三井住友銀行', '2026/09/16'],
  HEAD,
  ['2026/08/31', 'ﾓﾊﾞｲﾙﾊﾟｽﾓﾁﾔ-ｼﾞ', '本人*', '1回払い', '1,000', '0', '1,000', '1,000', '1,000', '0'],
  ['2026/08/29', 'APPLE COM BILL', '本人*', '1回払い', '1,524', '0', '1,524', '1,524', '1,524', '0'],
  ['2026/08/22', 'ﾐﾂﾄﾞﾀｳﾝ(ﾍﾝｻｲﾍﾝｺｳ', '本人*', '分割変更3回払い(1回目', '9,750', '287', '10,037', '3,347', '3,347', '6,690'],
  ['分割変更日：2026/08/31'],
  ['購入金額：¥9,750 / 分割変更金'],
  ['2026/04/02', 'SP DROP', '(ﾍﾝｻｲﾍﾝｺｳ', '本人', '分割変更6回払い(5回目', '-', '793', '20,247', '3,374', '3,374', '3,374'],
  ['購入金額：¥19,454 / 分割変更金'],
  ['2026/02/20', 'ﾉｰﾄﾞ(ﾍﾝｻｲﾍﾝｺｳ', '本人', '分割変更12回払い(7回', '-', '1,055', '13,991', '1,165', '1,165', '5,825'],
  ['購入金額：¥12,936 / 分割変更金'],
];

const card: Account = {
  id: 'card', createdAt: '', updatedAt: '', name: 'Rakuten Card', type: 'card', currency: 'JPY', opening: 0, openingDate: '2026-09-01', order: 0, paysFromId: 'bank',
};

describe('Rakuten statement', () => {
  const parsed = parseRakuten(rows);

  it('reads the bill, the pay date and every row, even when the shop name is split', () => {
    expect([parsed.billMonth, parsed.payDate, parsed.total]).toEqual(['2026-09', '2026-09-28', 20735]);
    expect(parsed.lines.map((l) => [l.kind, l.shop, l.count, l.nth, l.purchase])).toEqual([
      ['once', 'ﾓﾊﾞｲﾙﾊﾟｽﾓﾁﾔ-ｼﾞ', undefined, undefined, undefined],
      ['once', 'APPLE COM BILL', undefined, undefined, undefined],
      ['instalment', 'ﾐﾂﾄﾞﾀｳﾝ(ﾍﾝｻｲﾍﾝｺｳ', 3, 1, 9750],
      ['instalment', 'SP DROP (ﾍﾝｻｲﾍﾝｺｳ', 6, 5, 19454],
      ['instalment', 'ﾉｰﾄﾞ(ﾍﾝｻｲﾍﾝｺｳ', 12, 7, 12936],
    ]);
    expect(() => parseRakuten([['hello']])).toThrow(/Rakuten/);
  });

  it('splits the bill into one-time payments and instalments', () => {
    const s = toStatement(parsed, 'card', 'now');
    expect([s.once, s.instalments, s.plans.length]).toEqual([20735 - 7886, 7886, 3]);
  });

  it('works out exactly what the plans still charge each month', () => {
    expect(remainingPayments(6690, 2)).toEqual([3345, 3345]);
    expect(remainingPayments(10, 3)).toEqual([4, 3, 3]);
    const c = committed(toStatement(parsed, 'card', 'now'));
    expect([...c].map(([m, v]) => [m, v.total])).toEqual([
      ['2026-10', 3345 + 3374 + 1165],
      ['2026-11', 3345 + 1165],
      ['2026-12', 1165],
      ['2027-01', 1165],
      ['2027-02', 1165],
    ]);
    expect(c.get('2026-10')!.payments.find((p) => p.shop.startsWith('SP'))).toMatchObject({ nth: 6, count: 6, amount: 3374 });
  });

  it('estimates the next withdrawal from September entries plus known instalments', () => {
    const s = toStatement(parsed, 'card', 'now');
    const tx = (extra: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), createdAt: '', updatedAt: '', date: '2026-09-10', kind: 'expense', accountId: 'card', amount: 0, ...extra });
    const txs = [
      tx({ amount: 5000 }),
      tx({ amount: 3000, kind: 'transfer', toAccountId: 'pasmo', topUp: true }),
      tx({ amount: 500, refund: true }),
      tx({ amount: 20735, kind: 'transfer', accountId: 'bank', toAccountId: 'card' }), // a card payment isn't spending
      tx({ amount: 999, date: '2026-10-01' }), // next month's bill
    ];
    const next = nextBill(card, [s], txs, '2026-09-30');
    expect(next).toMatchObject({ billMonth: '2026-10', payDate: '2026-10-27', once: 7500, instalments: 7884, total: 15384, partial: false });
    expect(payDateFor('2026-12')).toBe('2026-12-28'); // the 27th is a Sunday
  });

  it('records each statement withdrawal once, on its pay date, from the paying account', () => {
    const s = toStatement(parsed, 'card', 'now');
    const w = dueWithdrawals([card], [s], new Set(), '2026-09-30', 'now');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ date: '2026-09-28', kind: 'transfer', accountId: 'bank', toAccountId: 'card', amount: 20735 });
    expect(dueWithdrawals([card], [s], new Set([w[0].id]), '2026-09-30', 'now')).toEqual([]);
    expect(dueWithdrawals([card], [s], new Set(), '2026-09-27', 'now')).toEqual([]); // not yet
    expect(dueWithdrawals([{ ...card, openingDate: '2026-09-30' }], [s], new Set(), '2026-10-01', 'now')).toEqual([]); // before the card was added
  });

  it('replaces estimated dollar purchases with the real yen amount', () => {
    const est: Transaction = {
      id: 't1', createdAt: '', updatedAt: '', date: '2026-08-28', kind: 'expense', accountId: 'card', amount: 1500,
      foreign: { amount: 999, currency: 'USD', estimated: true },
    };
    expect(matchEstimates(parsed, 'card', [est])).toEqual([{ tx: est, amount: 1524 }]);
    expect(matchEstimates(parsed, 'card', [{ ...est, date: '2026-08-01' }])).toEqual([]);
  });
});
