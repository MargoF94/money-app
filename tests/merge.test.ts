import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../src/lib/github';
import { emptyCollections, gitBlobSha, mergeRecords, parseFile, toBackup, toFiles } from '../src/lib/merge';
import { changedFiles, filesToWrite } from '../src/lib/sync.svelte';
import type { Category, Transaction } from '../src/lib/types';

const cat = (id: string, name: string, updatedAt: string, deleted?: boolean): Category => ({
  id, name, kind: 'expense', icon: 'grid', order: 0, createdAt: '2026-01-01', updatedAt, ...(deleted ? { deleted } : {}),
});
const tx = (id: string, date: string, amount = 100): Transaction => ({
  id, date, amount, kind: 'expense', accountId: 'a', createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

describe('mergeRecords', () => {
  it('keeps the newest version of each record, deletions included', () => {
    const merged = mergeRecords([cat('a', 'Local', '2026-02-01'), cat('b', 'Old', '2026-01-01')], [cat('a', 'Remote', '2026-01-15'), cat('b', 'Old', '2026-03-01', true)]);
    expect(merged.map((r) => [r.name, !!r.deleted])).toEqual([['Local', false], ['Old', true]]);
  });

  it('is symmetric', () => {
    const a = [cat('x', '1', '2026-01-01'), cat('y', '2', '2026-03-01')];
    const b = [cat('x', '3', '2026-02-01'), cat('y', '4', '2026-01-01')];
    expect(mergeRecords(a, b)).toEqual(mergeRecords(b, a));
  });
});

describe('data files', () => {
  it('puts transactions in one file per month and the rest in money.json', () => {
    const c = emptyCollections();
    c.categories = [cat('c1', 'Food', '2026-01-01')];
    c.transactions = [tx('t1', '2026-09-30'), tx('t2', '2026-10-01'), tx('t3', '2026-10-15')];
    const files = toFiles(c);
    expect([...files.keys()].sort()).toEqual(['money.json', 'transactions/2026-09.json', 'transactions/2026-10.json']);
    const oct = files.get('transactions/2026-10.json')!;
    expect(oct.split('\n').filter((l) => l.includes('"id"'))).toHaveLength(2); // one record per line
    expect(parseFile(oct).transactions!.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(parseFile(files.get('money.json')!).categories![0].name).toBe('Food');
  });

  it('writes the same text for the same data, whatever the order', () => {
    const a = emptyCollections();
    a.transactions = [tx('t1', '2026-10-01'), tx('t2', '2026-10-02')];
    const b = emptyCollections();
    b.transactions = [tx('t2', '2026-10-02'), tx('t1', '2026-10-01')];
    expect(toFiles(a)).toEqual(toFiles(b));
  });

  it('round-trips a backup and refuses other or newer files', () => {
    const c = emptyCollections();
    c.transactions = [tx('t1', '2026-10-01')];
    expect(parseFile(toBackup(c, '2026-10-01T00:00:00Z')).transactions).toEqual(c.transactions);
    expect(() => parseFile('{"hello":1}')).toThrow();
    expect(() => parseFile('{"app":"money-log","schema":99}')).toThrow(/newer version/);
    expect(() => parseFile('not json')).toThrow();
  });

  it('computes git blob ids', async () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('sync planning', () => {
  it('only writes files whose content differs from the repo', async () => {
    const local = new Map([['money.json', 'A\n'], ['transactions/2026-10.json', 'B\n']]);
    const remote = new Map([['money.json', await gitBlobSha('A\n')], ['transactions/2026-09.json', 'x']]);
    const writes = await changedFiles(filesToWrite(local, remote), remote);
    expect(writes.map(([p]) => p).sort()).toEqual(['transactions/2026-09.json', 'transactions/2026-10.json']);
    // A month that no longer has transactions here is written empty.
    expect(parseFile(writes.find(([p]) => p.endsWith('09.json'))![1]).transactions).toEqual([]);
  });
});

describe('base64', () => {
  it('handles Japanese text', () => {
    const text = 'ローソン ﾛｰｿﾝ 三井住友銀行';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
  });
});
