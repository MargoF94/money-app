// In-memory data backed by IndexedDB. Components read `store.*`;
// all writes go through the methods here so they persist and trigger sync.
import { defaultCategories, defaultSettings } from './constants';
import * as db from './db';
import { duePayments } from './bills';
import { balances } from './ledger';
import { emptyCollections, mergeCollections } from './merge';
import { COLLECTION_NAMES } from './types';
import type { Account, BaseRecord, Bill, Category, CollectionName, Collections, Settings, Transaction } from './types';
import { collator, nowIso, today } from './util';

type Listener = () => void;

/** Records created by the app itself (default categories) look older than any real edit, so edits always win. */
export const SEED_TIME = '1970-01-01T00:00:00.000Z';

const newestFirst = (a: Transaction, b: Transaction) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

class Store {
  data = $state.raw<Collections>(emptyCollections());
  loaded = $state(false);

  accounts = $derived(
    this.data.accounts.filter((a) => !a.deleted).sort((a, b) => a.order - b.order || collator.compare(a.name, b.name)),
  );
  accountsById = $derived(new Map(this.data.accounts.map((a) => [a.id, a])));
  openAccounts = $derived(this.accounts.filter((a) => !a.closed));

  categories = $derived(
    this.data.categories.filter((c) => !c.deleted).sort((a, b) => a.order - b.order || collator.compare(a.name, b.name)),
  );
  categoriesById = $derived(new Map(this.data.categories.map((c) => [c.id, c])));

  /** Newest first. */
  transactions = $derived(this.data.transactions.filter((t) => !t.deleted).sort(newestFirst));

  balances = $derived(balances(this.data.accounts, this.data.transactions));

  bills = $derived(this.data.bills.filter((b) => !b.deleted).sort((a, b) => collator.compare(a.name, b.name)));

  settings = $derived<Settings>(this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(SEED_TIME));

  #listeners = new Set<Listener>();

  // Other open tabs share their changes here, so every tab's copy stays current.
  #channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('money-log-data') : null;

  constructor() {
    this.#channel?.addEventListener('message', (e: MessageEvent) => {
      const { name, records, local } = e.data as { name: CollectionName; records: BaseRecord[]; local: boolean };
      if (!this.loaded || !COLLECTION_NAMES.includes(name)) return;
      this.data = mergeCollections(this.data, { [name]: records });
      if (local) this.#emit();
    });
  }

  #broadcast(name: CollectionName, records: BaseRecord[], local: boolean) {
    try {
      this.#channel?.postMessage({ name, records, local });
    } catch {
      /* another tab catches up when it next loads */
    }
  }

  async load(): Promise<void> {
    this.data = await db.loadAll();
    if (this.data.categories.length === 0) {
      const seeded = defaultCategories(SEED_TIME);
      await db.saveRecords('categories', seeded);
      this.data = { ...this.data, categories: seeded };
    }
    this.loaded = true;
  }

  /** Called after every local change (used to schedule sync). */
  onChange(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.#listeners) fn();
  }

  /** Inserts or updates records, stamping updatedAt. */
  async put<K extends CollectionName>(name: K, records: Collections[K][number][]): Promise<void> {
    if (records.length === 0) return;
    const now = nowIso();
    // Snapshot: records may contain reactive proxies, which IndexedDB cannot store.
    const stamped = records.map((r) => ({
      ...$state.snapshot(r),
      createdAt: r.createdAt && r.createdAt !== SEED_TIME ? r.createdAt : now,
      updatedAt: now,
    }));
    const ids = new Set(stamped.map((r) => r.id));
    const next = [...(this.data[name] as BaseRecord[]).filter((r) => !ids.has(r.id)), ...stamped];
    this.data = { ...this.data, [name]: next };
    await db.saveRecords(name, stamped);
    this.#broadcast(name, stamped, true);
    this.#emit();
  }

  /** Soft-deletes records so the deletion syncs to other devices. */
  async remove<K extends CollectionName>(name: K, records: BaseRecord[]): Promise<void> {
    await this.put(name, records.map((r) => ({ ...r, deleted: true })) as Collections[K][number][]);
  }

  /**
   * Merges records from another copy (sync or backup). Only records newer than the local
   * ones are written. Does not trigger sync. Returns the number of changed records.
   */
  async applyRemote(remote: Partial<Collections>): Promise<number> {
    let count = 0;
    const changed: [CollectionName, BaseRecord[]][] = [];
    for (const name of COLLECTION_NAMES) {
      const incoming = (remote[name] ?? []) as BaseRecord[];
      if (!incoming.length) continue;
      const local = new Map((this.data[name] as BaseRecord[]).map((r) => [r.id, r]));
      const newer = incoming.filter((r) => {
        const mine = local.get(r.id);
        return !mine || r.updatedAt > mine.updatedAt;
      });
      if (newer.length) {
        changed.push([name, newer]);
        count += newer.length;
      }
    }
    if (count === 0) return 0;
    this.data = mergeCollections(this.data, remote);
    for (const [name, records] of changed) {
      await db.saveRecords(name, records);
      this.#broadcast(name, records, false);
    }
    return count;
  }

  // ---- queries -------------------------------------------------------

  account(id: string | undefined): Account | undefined {
    const a = id ? this.accountsById.get(id) : undefined;
    return a && !a.deleted ? a : undefined;
  }

  category(id: string | undefined): Category | undefined {
    return id ? this.categoriesById.get(id) : undefined;
  }

  transaction(id: string): Transaction | undefined {
    const t = this.data.transactions.find((x) => x.id === id);
    return t && !t.deleted ? t : undefined;
  }

  balance(accountId: string): number {
    return this.balances.get(accountId) ?? 0;
  }

  /** Transactions touching an account, newest first. */
  transactionsFor(accountId: string): Transaction[] {
    return this.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
  }

  /** Payees used before, most used first, with the category used last time. */
  payees = $derived.by(() => {
    const map = new Map<string, { name: string; count: number; categoryId?: string; last: string }>();
    for (const t of this.transactions) {
      const name = t.payee?.trim();
      if (!name || t.kind === 'transfer') continue;
      const key = name.normalize('NFKC').toLowerCase();
      const e = map.get(key);
      if (e) e.count++;
      else map.set(key, { name, count: 1, categoryId: t.splits?.length ? undefined : t.categoryId, last: t.date });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  });

  /** Expense categories ordered by how often they were used lately, for the quick grid. */
  frequentCategories = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const t of this.transactions.slice(0, 300)) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    return (kind: 'expense' | 'income') =>
      this.categories
        .filter((c) => c.kind === kind && !c.hidden)
        .map((c, i) => ({ c, n: counts.get(c.id) ?? 0, i }))
        .sort((a, b) => b.n - a.n || a.i - b.i)
        .map((x) => x.c);
  });

  // ---- writes --------------------------------------------------------

  async saveTransaction(t: Transaction): Promise<void> {
    await this.put('transactions', [t]);
  }

  async deleteTransaction(t: Transaction): Promise<void> {
    await this.remove('transactions', [t]);
  }

  async saveAccount(a: Account): Promise<void> {
    await this.put('accounts', [a]);
  }

  /** Accounts with transactions are closed (hidden, history kept) rather than deleted. */
  async deleteAccount(a: Account): Promise<void> {
    if (this.transactionsFor(a.id).length) await this.put('accounts', [{ ...a, closed: true }]);
    else await this.remove('accounts', [a]);
  }

  async saveCategory(c: Category): Promise<void> {
    await this.put('categories', [c]);
  }

  async saveBill(b: Bill): Promise<void> {
    await this.put('bills', [b]);
    await this.addDuePayments();
  }

  /** Stops a bill; payments already added stay. */
  async deleteBill(b: Bill): Promise<void> {
    await this.remove('bills', [b]);
  }

  /** Adds subscription and bill payments that are due by today (called on start, after sync, and when the app is reopened). */
  async addDuePayments(): Promise<number> {
    if (!this.loaded) return 0;
    const ids = new Set(this.data.transactions.map((t) => t.id));
    // Payments before an account's starting date are already inside its opening balance.
    const due = duePayments(this.data.bills, ids, today(), nowIso()).filter((t) => {
      const a = this.account(t.accountId);
      return a && t.date >= a.openingDate;
    });
    if (due.length) await this.put('transactions', due);
    return due.length;
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const current = this.data.settings.find((s) => s.id === 'settings' && !s.deleted) ?? defaultSettings(nowIso());
    await this.put('settings', [{ ...current, ...patch, id: 'settings' }]);
  }
}

export const store = new Store();
