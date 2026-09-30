<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { ACCOUNT_GROUPS, ACCOUNT_TYPE } from '../lib/constants';
  import { formatMoney } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import type { Account } from '../lib/types';

  let showClosed = $state(false);

  const shown = $derived(store.accounts.filter((a) => showClosed || !a.closed));
  const groups = $derived(
    ACCOUNT_GROUPS.map((g) => ({ name: g, accounts: shown.filter((a) => ACCOUNT_TYPE[a.type].group === g) })).filter((g) => g.accounts.length),
  );
  // Net worth per currency: everything you have, minus what cards are owed; money lent counts as yours.
  const totals = $derived.by(() => {
    const t = { JPY: 0, USD: 0 };
    for (const a of store.accounts) if (!a.closed) t[a.currency] += store.balance(a.id);
    return t;
  });
  const closedCount = $derived(store.accounts.filter((a) => a.closed).length);

  function sub(a: Account): string {
    if (a.closed) return 'Closed';
    if (a.type === 'prepaid' && a.topUpFromId) return `Top-ups from ${store.account(a.topUpFromId)?.name ?? '?'}`;
    if (a.type === 'card' && a.paysFromId) return `Paid from ${store.account(a.paysFromId)?.name ?? '?'}`;
    if (a.type === 'lent') return 'Still owed to you';
    return ACCOUNT_TYPE[a.type].label;
  }
</script>

<div class="row between">
  <h1>Accounts</h1>
  <a class="btn small" href="#/account/new"><Icon name="plus" size={16} />Add</a>
</div>

{#if store.accounts.length === 0}
  <div class="card empty">
    <p>Add your accounts to start: 三井住友銀行, MUFG, Rakuten Card, PASMO, Starbucks, PayPay, cash at home…</p>
    <a class="btn primary" href="#/account/new">Add an account</a>
  </div>
{:else}
  <section class="card worth">
    <span class="muted">Net worth</span>
    <span class="hero num">{formatMoney(totals.JPY, 'JPY')}</span>
    {#if totals.USD}<span class="small muted">plus {formatMoney(totals.USD, 'USD')}</span>{/if}
    <span class="xs muted">What you have, minus what your cards owe. Money lent counts as yours.</span>
  </section>

  {#each groups as g (g.name)}
    <div class="sec-head"><h2>{g.name}</h2></div>
    <div class="card flush">
      {#each g.accounts as a (a.id)}
        <a class="acct" href="#/account/{a.id}" class:closed={a.closed}>
          <span class="icon"><Icon name={ACCOUNT_TYPE[a.type].icon} size={18} /></span>
          <span class="grow col">
            <span class="name">{a.name}{#if a.currency === 'USD'} <span class="cur-badge">USD</span>{/if}</span>
            <span class="xs muted">{sub(a)}</span>
          </span>
          <span class="amt">{formatMoney(store.balance(a.id), a.currency)}</span>
        </a>
      {/each}
    </div>
  {/each}

  {#if closedCount}
    <label class="check small"><input type="checkbox" bind:checked={showClosed} /> Show closed accounts ({closedCount})</label>
  {/if}
{/if}

<style>
  h1 {
    margin: 0;
  }

  .worth {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 1rem 0 1.5rem;
  }

  .sec-head {
    margin: 1.2rem 0 0.5rem;
  }

  .acct {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 0;
    color: var(--text);
    text-decoration: none;
  }

  .acct + .acct {
    border-top: 1px solid var(--border);
  }

  .acct.closed {
    opacity: 0.6;
  }

  .icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .col {
    display: flex;
    flex-direction: column;
  }

  .name {
    font-weight: 500;
  }

  .check {
    margin-top: 1rem;
  }
</style>
