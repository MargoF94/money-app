import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, toInput } from '../src/lib/money';
import { estimateYen } from '../src/lib/fx';

describe('amounts', () => {
  it('reads what people type, in the smallest unit', () => {
    expect(parseAmount('1540', 'JPY')).toBe(1540);
    expect(parseAmount('¥1,540', 'JPY')).toBe(1540);
    expect(parseAmount('１，５４０円', 'JPY')).toBe(1540);
    expect(parseAmount('1200+340', 'JPY')).toBe(1540);
    expect(parseAmount('2000-460', 'JPY')).toBe(1540);
    expect(parseAmount('15.49', 'USD')).toBe(1549);
    expect(parseAmount('$1,003.2', 'USD')).toBe(100320);
    expect(parseAmount('', 'JPY')).toBeUndefined();
    expect(parseAmount('abc', 'JPY')).toBeUndefined();
    expect(parseAmount('12+', 'JPY')).toBeUndefined();
  });

  it('avoids floating point drift in cents', () => {
    expect(parseAmount('0.1+0.2', 'USD')).toBe(30);
    expect(parseAmount('19.99', 'USD')).toBe(1999);
  });

  it('formats with sign and currency', () => {
    expect(formatMoney(154000, 'JPY')).toBe('¥154,000');
    expect(formatMoney(-2860, 'JPY')).toBe('−¥2,860');
    expect(formatMoney(312000, 'JPY', true)).toBe('+¥312,000');
    expect(formatMoney(1549, 'USD')).toBe('$15.49');
    expect(toInput(1549, 'USD')).toBe('15.49');
    expect(toInput(1540, 'JPY')).toBe('1540');
  });

  it('estimates the yen for a dollar purchase with the card fee', () => {
    expect(estimateYen(1000, 150, 1.63)).toBe(1524); // $10 × 150 × 1.0163
  });
});
