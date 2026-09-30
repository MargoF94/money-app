<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TxRow from '../components/TxRow.svelte';
  import { totals } from '../lib/ledger';
  import { formatMoney } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import { formatMonth, today } from '../lib/util';

  const month = today().slice(0, 7);
  const lastDay = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const daysLeft = lastDay - +today().slice(8, 10);

  const yenTx = $derived(store.data.transactions.filter((t) => store.account(t.accountId)?.currency !== 'USD'));
  const sums = $derived(totals(yenTx, `${month}-01`, `${month}-31`));
  const top = $derived(
    [...sums.byCategory]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, v]) => ({ id, v, name: store.category(id)?.name ?? 'No category', icon: store.category(id)?.icon ?? 'grid' })),
  );
  const max = $derived(Math.max(1, ...top.map((t) => t.v)));

  const worth = $derived.by(() => {
    const t = { JPY: 0, USD: 0 };
    for (const a of store.accounts) if (!a.closed) t[a.currency] += store.balance(a.id);
    return t;
  });
  const cards = $derived(store.accounts.filter((a) => a.type === 'card' && !a.closed));
</script>

<h1>Home</h1>

{#if store.accounts.length === 0}
  <div class="card empty">
    <h2>Welcome to Money Log</h2>
    <p>Start by adding your accounts: banks, Rakuten Card, PASMO, Starbucks, PayPay, cash at home.</p>
    <a class="btn primary" href="#/account/new">Add an account</a>
    <p class="small">Already using Money Log on another device? <a href="#/settings">Connect sync</a> to load your data.</p>
  </div>
{:else}
  <div class="stack">
    <section class="card stack month">
      <div class="row between"><h2>{formatMonth(month).split(' ')[0]}</h2><span class="small muted">{daysLeft === 0 ? 'Last day' : `${daysLeft} days left`}</span></div>
      <div class="col">
        <span class="hero num">{formatMoney(sums.spent, 'JPY')}</span>
        <span class="muted">spent this month</span>
      </div>
      {#if sums.income}
        <div class="row between small"><span class="muted">Income</span><span class="amt in">{formatMoney(sums.income, 'JPY', true)}</span></div>
      {/if}
      {#if top.length}
        <div class="divider"></div>
        <div class="bars">
          {#each top as t (t.id)}
            <a class="bar" href="#/activity?m={month}{t.id ? `&c=${t.id}` : ''}">
              <span class="row between small"><span class="row"><Icon name={t.icon} size={16} />{t.name}</span><span class="num muted">{formatMoney(t.v, 'JPY')}</span></span>
              <span class="track"><span class="fill" style:width="{(t.v / max) * 100}%"></span></span>
            </a>
          {/each}
        </div>
      {/if}
      <p class="xs muted">Budgets and the pace line come in the next stage.</p>
    </section>

    <section class="stack">
      <div class="sec-head"><h2>Recent</h2><a class="link" href="#/activity">All activity<Icon name="fwd" size={16} /></a></div>
      {#if store.transactions.length}
        <div class="card flush">{#each store.transactions.slice(0, 6) as t (t.id)}<TxRow tx={t} showDate />{/each}</div>
      {:else}
        <p class="muted">No transactions yet. <a href="#/add">Add one</a>.</p>
      {/if}
    </section>

    <section class="stack">
      <div class="sec-head"><h2>Money</h2><a class="link" href="#/accounts">Accounts<Icon name="fwd" size={16} /></a></div>
      <div class="card stack money">
        <div class="row between"><span class="muted">Net worth</span><span class="big num">{formatMoney(worth.JPY, 'JPY')}</span></div>
        {#if worth.USD}<div class="row between small"><span class="muted">Dollar accounts</span><span class="num">{formatMoney(worth.USD, 'USD')}</span></div>{/if}
        {#each cards as c (c.id)}
          <a class="row between small plain" href="#/account/{c.id}"><span class="muted">{c.name} owed</span><span class="num">{formatMoney(-store.balance(c.id), c.currency)}</span></a>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .month {
    gap: 10px;
  }

  .col {
    display: flex;
    flex-direction: column;
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text);
    text-decoration: none;
  }

  .money {
    gap: 8px;
  }

  .plain {
    color: var(--text);
    text-decoration: none;
  }

  .xs {
    margin: 0;
  }
</style>
