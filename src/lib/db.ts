import Dexie, { type Table } from 'dexie';
import { emptyCollections } from './merge';
import { COLLECTION_NAMES, type BaseRecord, type CollectionName, type Collections } from './types';

/** Device-local key/value data that is never synced (sync token, file fingerprints, UI prefs). */
export interface MetaRow {
  key: string;
  value: unknown;
}

class MoneyDb extends Dexie {
  meta!: Table<MetaRow, string>;

  constructor() {
    super('money-log');
    const schema: Record<string, string> = { meta: 'key' };
    for (const name of COLLECTION_NAMES) schema[name] = 'id';
    const { bills: _bills, statements: _statements, ...v1 } = schema;
    this.version(1).stores(v1);
    this.version(2).stores({ ...v1, bills: 'id' }); // + bills
    this.version(3).stores(schema); // + statements
  }

  coll(name: CollectionName): Table<BaseRecord, string> {
    return this.table(name);
  }
}

export const db = new MoneyDb();

export async function loadAll(): Promise<Collections> {
  const out = emptyCollections();
  for (const name of COLLECTION_NAMES) {
    (out as unknown as Record<string, BaseRecord[]>)[name] = await db.coll(name).toArray();
  }
  return out;
}

export async function saveRecords(name: CollectionName, records: BaseRecord[]): Promise<void> {
  await db.coll(name).bulkPut(records);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
