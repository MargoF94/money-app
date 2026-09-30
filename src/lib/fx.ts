// Yen per dollar for a day, from free sources that allow browser requests.
// Used to estimate dollar purchases on a yen card until the statement gives the real amount.
import { today } from './util';

const cache = new Map<string, Promise<number | null>>();

async function tryJson(url: string): Promise<Record<string, any> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRate(date: string): Promise<number | null> {
  // 1. Frankfurter (European Central Bank reference rates)
  for (const url of [
    `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=JPY`,
    `https://api.frankfurter.app/${date}?from=USD&to=JPY`,
  ]) {
    const jpy = (await tryJson(url))?.rates?.JPY;
    if (typeof jpy === 'number') return jpy;
  }
  // 2. fawazahmed0/exchange-api via jsDelivr
  const jpy = (await tryJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.json`))?.usd?.jpy;
  return typeof jpy === 'number' ? jpy : null;
}

/** Yen per dollar on a day (YYYY-MM-DD); today or later uses the latest rate. Null when offline. */
export function yenPerDollar(date: string | undefined): Promise<number | null> {
  const key = !date || date >= today() ? 'latest' : date;
  let p = cache.get(key);
  if (!p) {
    p = fetchRate(key).then((r) => {
      if (r === null) cache.delete(key); // try again next time
      return r;
    });
    cache.set(key, p);
  }
  return p;
}

/** Estimated yen charged for a dollar amount (cents) at a rate plus the card's fee in percent. */
export function estimateYen(cents: number, rate: number, feePct: number): number {
  return Math.round((cents / 100) * rate * (1 + feePct / 100));
}
