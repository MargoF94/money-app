// Merging and the layout of the data repo: money.json holds every collection
// except transactions; transactions live in transactions/YYYY-MM.json by date.
// Records are written one per line with sorted keys, so git diffs show exactly
// which records changed and the text (and its git sha) only changes when the data does.
import { APP_ID, COLLECTION_NAMES, MAIN_COLLECTIONS, SCHEMA, type BaseRecord, type Collections, type Transaction } from './types';

export const MAIN_PATH = 'money.json';
export const monthPath = (month: string) => `transactions/${month}.json`;
const MONTH_FILE = /^transactions\/(\d{4}-\d{2})\.json$/;

export function isDataPath(path: string): boolean {
  return path === MAIN_PATH || MONTH_FILE.test(path);
}

export function emptyCollections(): Collections {
  return { accounts: [], categories: [], tags: [], settings: [], bills: [], statements: [], budgets: [], goals: [], transactions: [] };
}

const byId = (x: BaseRecord, y: BaseRecord) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/** Merges two versions of a collection; for each id the newest `updatedAt` wins. */
export function mergeRecords<T extends BaseRecord>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const rec of [...a, ...b]) {
    const existing = map.get(rec.id);
    if (!existing || rec.updatedAt > existing.updatedAt) map.set(rec.id, rec);
  }
  return [...map.values()].sort(byId);
}

export function mergeCollections(a: Collections, b: Partial<Collections>): Collections {
  const out = emptyCollections();
  for (const name of COLLECTION_NAMES) {
    (out as unknown as Record<string, BaseRecord[]>)[name] = mergeRecords(
      (a[name] ?? []) as BaseRecord[],
      (b[name] ?? []) as BaseRecord[],
    );
  }
  return out;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** A data file: header fields, then each collection as an array with one record per line. */
export function serialize(header: Record<string, unknown>, collections: Record<string, BaseRecord[]>): string {
  const lines = ['{'];
  const head = Object.entries(header).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const names = Object.keys(collections).sort();
  const body = names.map((name) => {
    const recs = [...collections[name]].sort(byId).map((r) => '    ' + JSON.stringify(sortKeys(r)));
    return recs.length ? `  ${JSON.stringify(name)}: [\n${recs.join(',\n')}\n  ]` : `  ${JSON.stringify(name)}: []`;
  });
  lines.push([...head, ...body].join(',\n'));
  lines.push('}');
  return lines.join('\n') + '\n';
}

/** Every file the data repo should hold for these collections, path → text. */
export function toFiles(c: Collections): Map<string, string> {
  const files = new Map<string, string>();
  const main: Record<string, BaseRecord[]> = {};
  for (const name of MAIN_COLLECTIONS) main[name] = c[name];
  files.set(MAIN_PATH, serialize({ app: APP_ID, schema: SCHEMA }, main));
  const byMonth = new Map<string, Transaction[]>();
  for (const t of c.transactions) {
    const month = t.date.slice(0, 7);
    const list = byMonth.get(month);
    if (list) list.push(t);
    else byMonth.set(month, [t]);
  }
  for (const [month, list] of byMonth) {
    files.set(monthPath(month), serialize({ app: APP_ID, schema: SCHEMA, month }, { transactions: list }));
  }
  return files;
}

/** Reads money.json, a month file or a full backup; returns its collections. */
export function parseFile(text: string): Partial<Collections> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is damaged or is not a Money Log file.');
  }
  if (!data || typeof data !== 'object' || data.app !== APP_ID) throw new Error('This file is not a Money Log file.');
  if (typeof data.schema === 'number' && data.schema > SCHEMA) {
    throw new Error('Your data was saved by a newer version of the app. Close and reopen the app to update it.');
  }
  const out: Partial<Collections> = {};
  for (const name of COLLECTION_NAMES) {
    if (Array.isArray(data[name])) (out as Record<string, unknown>)[name] = data[name];
  }
  return out;
}

/** A single-file backup of everything (Settings → Download backup). */
export function toBackup(c: Collections, savedAt: string): string {
  const all: Record<string, BaseRecord[]> = {};
  for (const name of COLLECTION_NAMES) all[name] = c[name];
  return serialize({ app: APP_ID, schema: SCHEMA, backup: true, savedAt }, all);
}

/** Git's blob id for a text file, used to tell whether a file in the repo already has this content. */
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const hash = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
