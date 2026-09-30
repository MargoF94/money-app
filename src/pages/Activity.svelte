<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TxRow from '../components/TxRow.svelte';
  import { amountFor, totals } from '../lib/ledger';
  import { formatMoney, parseAmount } from '../lib/money';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import type { Transaction } from '../lib/types';
  import { addMonths, formatDate, formatMonth, normalize, today } from '../lib/util';

  // Filters live in the URL (?m=2026-10&a=<account>&c=<category>&q=text) so Back keeps them.
  const q = $derived(router.route.query);
  const month = $derived(/^\d{4}-\d{2}$/.test(q.get('m') ?? '') ? q.get('m')! : today().slice(0, 7));
  const accountId = $derived(q.get('a') ?? '');
  const categoryId = $derived(q.get('c') ?? '');
  let search = $state(router.route.query.get('q') ?? '');

  function matches(t: Transaction, text: string): boolean {
    if (!text) return true;
    const n = normalize(text);
    const amount = parseAmount(text, 'JPY');
    const hay = [t.payee, t.note, store.category(t.categoryId)?.name, store.account(t.accountId)?.name, store.account(t.toAccountId)?.name]
      .filter(Boolean)
      .map((s) => normalize(s!));
    return hay.some((h) => h.includes(n)) || (amount !== undefined && Math.abs(t.amount) === amount);
  }

  // Searching looks through every month; otherwise one month at a time.
  const list = $derived(
    store.transactions.filter(
      (t) =>
        (search.trim() ? true : t.date.startsWith(month)) &&
        (!accountId || t.accountId === accountId || t.toAccountId === accountId) &&
        (!categoryId || t.categoryId === categoryId || t.splits?.some((s) => s.categoryId === categoryId)) &&
        matches(t, search.trim()),
    ),
  );

  const days = $derived.by(() => {
    const out: { date: string; txs: Transaction[]; net: number }[] = [];
    for (const t of list) {
      let d = out.at(-1);
      if (!d || d.date !== t.date) out.push((d = { date: t.date, txs: [], net: 0 }));
      d.txs.push(t);
      if (t.kind !== 'transfer') d.net += amountFor(t);
    }
    return out;
  });

  const sums = $derived(
    totals(store.data.transactions.filter((t) => store.account(t.accountId)?.currency !== 'USD'), `${month}-01`, `${month}-31`, accountId ? new Set([accountId]) : undefined),
  );

  let shownDays = $state(40);
</script>

<h1>Activity</h1>

<div class="stack filters">
  <label class="search">
    <Icon name="search" size={18} />
    <input type="search" placeholder="Search payee, note or amount" bind:value={search} onchange={() => router.setQuery({ q: search.trim() || undefined })} aria-label="Search" />
  </label>
  {#if !search.trim()}
    <div class="row between month">
      <button type="button" class="btn ghost icon" aria-label="Previous month" onclick={() => router.setQuery({ m: addMonths(month, -1) })}><Icon name="back" /></button>
      <h2>{formatMonth(month)}</h2>
      <button type="button" class="btn ghost icon" aria-label="Next month" onclick={() => router.setQuery({ m: addMonths(month, 1) })}><Icon name="fwd" /></button>
    </div>
  {/if}
  <div class="row">
    <select value={accountId} onchange={(e) => router.setQuery({ a: e.currentTarget.value || undefined })} aria-label="Account">
      <option value="">All accounts</option>
      {#each store.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
    </select>
    <select value={categoryId} onchange={(e) => router.setQuery({ c: e.currentTarget.value || undefined })} aria-label="Category">
      <option value="">All categories</option>
      {#each store.categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </div>
  {#if !search.trim()}
    <div class="card row between small">
      <span><span class="muted">Spent</span> <strong class="num">{formatMoney(sums.spent, 'JPY')}</strong></span>
      <span><span class="muted">Income</span> <strong class="amt in">{formatMoney(sums.income, 'JPY', true)}</strong></span>
    </div>
  {/if}
</div>

{#if days.length === 0}
  <p class="empty">{search.trim() ? 'Nothing found.' : 'Nothing this month yet.'} <a href="#/add">Add a transaction</a></p>
{:else}
  {#each days.slice(0, shownDays) as d (d.date)}
    <div class="day-head">
      <span>{d.date === today() ? 'Today · ' : ''}{formatDate(d.date)}</span>
      {#if d.net}<span class="num">{formatMoney(d.net, 'JPY', true)}</span>{/if}
    </div>
    <div class="card flush">
      {#each d.txs as t (t.id)}<TxRow tx={t} />{/each}
    </div>
  {/each}
  {#if days.length > shownDays}<button type="button" class="btn more" onclick={() => (shownDays += 60)}>Show more</button>{/if}
{/if}

<style>
  .filters {
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 0.7em;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-2);
  }

  .search input {
    border: none;
    padding-left: 0;
    background: transparent;
  }

  .search input:focus {
    outline: none;
  }

  .month h2 {
    margin: 0;
  }

  .row select {
    flex: 1;
    width: auto;
  }

  .day-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--text-2);
    font-weight: 600;
    margin: 1rem 2px 0.3rem;
  }

  .more {
    margin-top: 1rem;
  }
</style>
