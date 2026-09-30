<script lang="ts">
  import { formatMoney } from '../lib/money';
  import { monthPlan } from '../lib/plan';
  import { store } from '../lib/store.svelte';
  import { formatDate, formatMonth, today } from '../lib/util';
  import Icon from './Icon.svelte';

  // A payday month, like the spreadsheet: salary in, what goes out, what's left to save.
  let { month }: { month: string } = $props();

  const salaryCats = $derived(new Set(store.categories.filter((c) => c.kind === 'income' && /salary|bonus/i.test(c.name + c.id)).map((c) => c.id)));
  const plan = $derived(
    monthPlan(month, { accounts: store.accounts, bills: store.bills, statements: store.statements, transactions: store.data.transactions }, salaryCats, today()),
  );

  const savings = $derived(store.accounts.filter((a) => !a.closed && ['savings', 'cash', 'investment', 'lent'].includes(a.type) && a.currency === 'JPY'));
  const together = $derived(savings.reduce((s, a) => s + store.balance(a.id), 0));
  const lent = $derived(store.accounts.filter((a) => a.type === 'lent' && !a.closed));
</script>

<section class="card stack">
  <div class="row between">
    <span class="muted">Salary · {formatDate(plan.salaryDate)}</span>
    <span class="big amt in">{formatMoney(plan.salary, 'JPY', true)}</span>
  </div>
  {#if plan.salaryExpected}
    <p class="xs muted m0">
      {plan.salary ? 'Expected: your last salary. The real one counts once you add it (Income → Salary).' : 'Add your salary as Income → Salary when it arrives.'}
    </p>
  {/if}
  <div class="divider"></div>
  <div class="row between"><span class="muted">Planned out</span><span class="num strong">{formatMoney(-plan.out, 'JPY')}</span></div>
  <div class="row between"><span class="strong">Left to save</span><span class="big num">{formatMoney(plan.left, 'JPY')}</span></div>
</section>

<div class="sec-head"><h2>Planned out</h2><a class="link" href="#/bill/new">Add<Icon name="fwd" size={16} /></a></div>
{#if plan.items.length === 0}
  <p class="small muted">Nothing planned for {formatMonth(month)} yet. Add rent, Paidy, cash for the month or a fund under Bills (untick “automatically” for amounts you set aside yourself).</p>
{:else}
  <div class="card flush">
    {#each plan.items as i, k (k)}
      <a class="item" href={i.kind === 'card' ? `#/account/${i.id}` : `#/bill/${i.id}`}>
        <span class="col">
          <span>{i.name}</span>
          <span class="xs muted">
            {i.date ? formatDate(i.date) : 'this month'}{i.kind === 'card' ? (i.estimate ? ' · estimate' : ' · from the 明細') : i.kind === 'planned' ? ' · set aside' : ''}
          </span>
        </span>
        <span class="amt">{formatMoney(i.amount, 'JPY')}</span>
      </a>
    {/each}
  </div>
  <p class="xs muted">Subscriptions paid with a card are inside that card's withdrawal.</p>
{/if}

{#if savings.length}
  <div class="sec-head"><h2>Savings</h2></div>
  <section class="card stack">
    {#each savings as a (a.id)}
      <a class="row between small plain" href="#/account/{a.id}"><span class="muted">{a.name}</span><span class="num">{formatMoney(store.balance(a.id), 'JPY')}</span></a>
    {/each}
    <div class="divider"></div>
    <div class="row between"><span class="strong">Everything together</span><span class="big num">{formatMoney(together, 'JPY')}</span></div>
  </section>
{/if}

{#if lent.length}
  <div class="sec-head"><h2>Money lent</h2></div>
  <div class="card flush">
    {#each lent as a (a.id)}
      <a class="item" href="#/account/{a.id}">
        <span class="col"><span>{a.name}</span>{#if a.note}<span class="xs muted">{a.note}</span>{/if}</span>
        <span class="col right"><span class="amt">{formatMoney(store.balance(a.id), 'JPY')}</span><span class="xs muted">still owed</span></span>
      </a>
    {/each}
  </div>
{/if}

<style>
  .m0 {
    margin: 0;
  }

  .sec-head {
    margin: 1.25rem 0 0.5rem;
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    color: var(--text);
    text-decoration: none;
  }

  .item + .item {
    border-top: 1px solid var(--border);
  }

  .col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .right {
    align-items: flex-end;
  }

  .plain {
    color: var(--text);
    text-decoration: none;
  }
</style>
