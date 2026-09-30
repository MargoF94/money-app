export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(): string {
  return toDateString(new Date());
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const utc = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

export function addDays(date: string, n: number): string {
  return new Date(utc(date) + n * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(utc(date)).getUTCDay() + 6) % 7;
}

/** "2026-09" + 1 → "2026-10". */
export function addMonths(month: string, n: number): string {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Wed 30 Sep", with the year when it isn't the current one. */
export function formatDate(date: string | undefined, now = today()): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const base = `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
  return y === +now.slice(0, 4) ? base : `${base} ${y}`;
}

/** "September 2026". */
export function formatMonth(month: string): string {
  return `${MONTHS_LONG[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;
}

/** Normalises text for searching and matching: full/half-width folding (ﾛｰｿﾝ → ローソン), case, katakana → hiragana. */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}

export const collator = new Intl.Collator(['en', 'ja'], { sensitivity: 'base', numeric: true });

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
