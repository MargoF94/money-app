// Amounts are whole numbers in the smallest unit of their currency (yen, or cents).
import type { Currency } from './types';

export const CURRENCIES: { value: Currency; label: string; symbol: string; decimals: number }[] = [
  { value: 'JPY', label: 'Japanese yen', symbol: '¥', decimals: 0 },
  { value: 'USD', label: 'US dollar', symbol: '$', decimals: 2 },
];

export const decimalsOf = (c: Currency) => (c === 'USD' ? 2 : 0);
export const symbolOf = (c: Currency) => (c === 'USD' ? '$' : '¥');

const MINUS = '−';

/** 154000 JPY → "¥154,000"; 1549 USD → "$15.49". `sign` adds "+" to positive amounts. */
export function formatMoney(minor: number, currency: Currency, sign = false): string {
  const dec = decimalsOf(currency);
  const value = Math.abs(minor) / 10 ** dec;
  const text = symbolOf(currency) + value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (minor < 0) return MINUS + text;
  return sign && minor > 0 ? '+' + text : text;
}

/** The number as typed in an input: 154000 → "154000", 1549 USD → "15.49". */
export function toInput(minor: number | undefined, currency: Currency): string {
  if (minor === undefined) return '';
  const dec = decimalsOf(currency);
  return dec ? (minor / 10 ** dec).toFixed(dec) : String(minor);
}

/**
 * Reads a typed amount into the smallest unit. Accepts full-width digits, "¥", "$", commas,
 * spaces and simple sums such as "1200+340-50". Returns undefined when it isn't a number.
 */
export function parseAmount(text: string, currency: Currency): number | undefined {
  const cleaned = text.normalize('NFKC').replace(/[¥$￥,\s円]/g, '').replace(/[−–ー]/g, '-');
  if (!cleaned || !/^[-+]?\d*\.?\d+([-+]\d*\.?\d+)*$/.test(cleaned)) return undefined;
  const terms = cleaned.match(/[-+]?\d*\.?\d+/g) ?? [];
  const dec = decimalsOf(currency);
  let total = 0;
  for (const t of terms) total += Math.round(Number(t) * 10 ** dec);
  return Number.isFinite(total) ? total : undefined;
}
