<script lang="ts">
  import BarList from '../components/charts/BarList.svelte';
  import ColumnChart from '../components/charts/ColumnChart.svelte';
  import LineChart from '../components/charts/LineChart.svelte';
  import PieChart from '../components/charts/PieChart.svelte';
  import StatTile from '../components/charts/StatTile.svelte';
  import Icon from '../components/Icon.svelte';
  import { downloadCsv, transactionsCsv } from '../lib/csv';
  import { formatMoney } from '../lib/money';
  import { router } from '../lib/router.svelte';
  import { compactYen, computeStats, pinnedCategories, PRESETS, presetPeriod, type Period, type PresetId } from '../lib/stats';
  import { store } from '../lib/store.svelte';
  import { formatDate, today } from '../lib/util';

  // Filters live in the URL (?p=…&from=…&to=…) so Back keeps them.
  const q = $derived(router.route.query);
  const preset = $derived.by<PresetId | 'custom'>(() => {
    const p = q.get('p');
    return p === 'custom' || PRESETS.some((x) => x.id === p) ? (p as PresetId | 'custom') : 'this-month';
  });
  const period = $derived<Period>(
    preset === 'custom' ? ordered(q.get('from') || undefined, q.get('to') || undefined) : presetPeriod(preset, today()),
  );
  function ordered(from?: string, to?: string): Period {
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  function setPreset(p: PresetId | 'custom') {
    if (p === 'custom') router.setQuery({ p, from: q.get('from') || period.from || `${today().slice(0, 4)}-01-01`, to: q.get('to') || today() });
    else router.setQuery({ p: p === 'this-month' ? undefined : p, from: undefined, to: undefined });
  }

  const stats = $derived(computeStats(store.accounts, store.data.transactions, period, today()));
  const money = (n: number) => formatMoney(n, 'JPY');
  const catName = (id: string) => (id ? (store.category(id)?.name ?? '?') : 'No category');

  // The 5 biggest categories of the last 12 months keep their colours (validated set); the rest are Other.
  const pinned = $derived(pinnedCategories(store.data.transactions, today()));
  const slices = $derived.by(() => {
    const out = pinned
      .map((id, i) => ({ label: catName(id), value: stats.byCategory.find((c) => c.id === id)?.value ?? 0, color: `var(--cat-${i + 1})` }))
      .filter((s) => s.value > 0);
    const other = stats.byCategory.filter((c) => !pinned.includes(c.id)).reduce((s, c) => s + c.value, 0);
    if (other > 0) out.push({ label: 'Other', value: other, color: 'var(--cat-other)' });
    return out;
  });

  const multiMonth = $derived(stats.months.length > 1);
  const catLink = (name: string) => {
    const c = stats.byCategory.find((x) => catName(x.id) === name);
    return c?.id && preset === 'this-month' ? `#/activity?c=${c.id}` : undefined;
  };

  function exportCsv() {
    const list = store.transactions.filter((t) => t.date >= stats.from && t.date <= stats.to).reverse();
    downloadCsv(transactionsCsv(list, store), `money-log-${stats.from}-${stats.to}.csv`);
  }
</script>

<h1>Stats</h1>

<div class="filters" role="group" aria-label="Period">
  {#each PRESETS as p (p.id)}
    <button type="button" class="chip" class:accent={preset === p.id} aria-pressed={preset === p.id} onclick={() => setPreset(p.id)}>{p.label}</button>
  {/each}
  <button type="button" class="chip" class:accent={preset === 'custom'} aria-pressed={preset === 'custom'} onclick={() => setPreset('custom')}>Custom dates</button>
</div>
{#if preset === 'custom'}
  <div class="custom">
    <label class="field"><span>From</span><input type="date" value={q.get('from') ?? ''} onchange={(e) => router.setQuery({ from: e.currentTarget.value || undefined })} /></label>
    <label class="field"><span>To</span><input type="date" value={q.get('to') ?? ''} onchange={(e) => router.setQuery({ to: e.currentTarget.value || undefined })} /></label>
  </div>
{/if}
<p class="small muted period">{formatDate(stats.from)} – {formatDate(stats.to)} · yen accounts</p>

{#if stats.spent === 0 && stats.income === 0}
  <div class="card empty"><p>Nothing in this period yet.</p></div>
{:else}
  <div class="tiles">
    <StatTile label="Spent" value={money(stats.spent)} sub="{money(stats.perDay)} a day" />
    <StatTile label="Income" value={money(stats.income)} />
    <StatTile label="Saved" value={money(stats.saved)} sub={stats.income > 0 ? `${Math.round((stats.saved / stats.income) * 100)}% of income` : ''} />
    <StatTile label="Bills & subscriptions" value={money(stats.bills)} sub={stats.spent > 0 ? `${Math.round((stats.bills / stats.spent) * 100)}% of spending` : ''} />
  </div>

  <div class="charts">
    {#if multiMonth}
      <section class="card">
        <ColumnChart
          title="Income and spending each month"
          labels={stats.months.map((m) => m.label)}
          series={[
            { name: 'Income', color: 'var(--series-1)', values: stats.months.map((m) => m.income) },
            { name: 'Spending', color: 'var(--series-2)', values: stats.months.map((m) => m.spent) },
          ]}
          grouped
          format={compactYen}
        />
      </section>
    {/if}
    {#if slices.length}
      <section class="card">
        <PieChart
          title="Where the money went"
          caption="Your 5 biggest categories of the last 12 months keep their colours; the rest are Other."
          {slices}
          unit="spent"
          format={money}
          compact={compactYen}
        />
      </section>
    {/if}
    <section class="card">
      <BarList title="Spending by category" rows={stats.byCategory.map((c) => ({ name: catName(c.id), count: c.value }))} format={money} href={catLink} />
    </section>
    {#if multiMonth}
      <section class="card">
        <LineChart title="Net worth" caption="At the end of each month (yen accounts; cards owed count as minus)." labels={stats.months.map((m) => m.label)} values={stats.months.map((m) => m.netWorth)} format={compactYen} />
      </section>
    {/if}
    {#if stats.payees.length}
      <section class="card"><BarList title="Top payees" rows={stats.payees.slice(0, 8).map((p) => ({ name: p.name, count: p.value }))} format={money} /></section>
    {/if}
    <section class="card facts">
      <h3>More</h3>
      <dl>
        {#if stats.biggest}
          <dt>Biggest expense</dt>
          <dd><a href="#/tx/{stats.biggest.id}">{stats.biggest.payee || catName(stats.biggest.categoryId ?? '')}</a> · {money(stats.biggest.amount)} · {formatDate(stats.biggest.date)}</dd>
        {/if}
        {#if multiMonth}
          {@const top = [...stats.months].sort((a, b) => b.spent - a.spent)[0]}
          <dt>Most spent</dt>
          <dd>{top.label} · {money(top.spent)}</dd>
        {/if}
        <dt>Days</dt>
        <dd>{stats.days}</dd>
      </dl>
    </section>
  </div>
{/if}

<button type="button" class="btn export" onclick={exportCsv}><Icon name="download" size={18} />Download these transactions (CSV)</button>

<style>
  .filters {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin: 0.5rem 0 0.75rem;
  }

  .filters .chip {
    border: none;
    cursor: pointer;
    padding: 0.35em 0.85em;
  }

  .custom {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .custom .field {
    width: 10.5rem;
  }

  .period {
    margin: 0 0 1rem;
  }

  .tiles {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 1rem;
  }

  @media (min-width: 700px) {
    .tiles {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .charts {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 900px) {
    .charts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .facts h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 1rem;
    margin: 0;
    font-size: 0.9rem;
  }

  dt {
    color: var(--text-2);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .export {
    margin-top: 1.5rem;
  }
</style>
