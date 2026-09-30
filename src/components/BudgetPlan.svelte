<script lang="ts">
  import { formatMoney, parseAmount, toInput } from '../lib/money';
  import { budgetFor, budgetLines, pace, setBudget } from '../lib/plan';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Budget } from '../lib/types';
  import { formatMonth, nowIso, today } from '../lib/util';
  import Icon from './Icon.svelte';

  // Monthly budgets per category, with where you'd expect to be today.
  let { month }: { month: string } = $props();

  const yenTx = $derived(store.data.transactions.filter((t) => store.account(t.accountId)?.currency !== 'USD'));
  const lines = $derived(budgetLines(store.budgets, yenTx, month));
  const total = $derived(lines.reduce((s, l) => s + l.budget, 0));
  const spent = $derived(lines.reduce((s, l) => s + l.spent, 0));
  const now = $derived(pace(month, today()));
  const pct = (v: number, of: number) => (of > 0 ? Math.min(100, Math.max(0, (v / of) * 100)) : 0);

  // ---- editing: amounts from this month on --------------------------------------------
  let editing = $state(false);
  let draft = $state<Record<string, string>>({});
  const expenseCats = $derived(store.categories.filter((c) => c.kind === 'expense'));

  function startEdit() {
    draft = Object.fromEntries(
      expenseCats.map((c) => {
        const b = store.budgets.find((x) => x.categoryId === c.id);
        const v = b ? budgetFor(b, month) : undefined;
        return [c.id, v ? toInput(v, 'JPY') : ''];
      }),
    );
    editing = true;
  }

  async function saveEdit() {
    const now = nowIso();
    const changed: Budget[] = [];
    for (const c of expenseCats) {
      const text = draft[c.id]?.trim() ?? '';
      const amount = text === '' ? 0 : parseAmount(text, 'JPY');
      if (amount === undefined) return toasts.show(`“${text}” isn't an amount (${c.name}).`, 'error');
      const existing = store.budgets.find((b) => b.categoryId === c.id);
      const before = existing ? (budgetFor(existing, month) ?? 0) : 0;
      if (amount === before) continue;
      const base: Budget = existing ?? { id: `budget-${c.id}`, createdAt: now, updatedAt: now, categoryId: c.id, amounts: [] };
      changed.push(setBudget(base, month, amount));
    }
    await store.saveBudgets(changed);
    editing = false;
    toasts.show(changed.length ? `Budgets saved from ${formatMonth(month)} on.` : 'No changes.');
  }
</script>

{#if editing}
  <section class="card stack">
    <h2>Budgets from {formatMonth(month)} on</h2>
    <p class="xs muted m0">Earlier months keep their budgets. Leave a category empty for no budget.</p>
    <ul class="edit">
      {#each expenseCats as c (c.id)}
        <li>
          <span class="row"><Icon name={c.icon} size={18} />{c.name}</span>
          <input inputmode="numeric" placeholder="—" bind:value={draft[c.id]} aria-label="Budget for {c.name}" />
        </li>
      {/each}
    </ul>
    <div class="row">
      <button type="button" class="btn primary" onclick={saveEdit}>Save</button>
      <button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
    </div>
  </section>
{:else if lines.length === 0}
  <div class="card empty">
    <p>No budgets for {formatMonth(month)} yet. Set an amount for the categories you want to watch, e.g. Groceries or Eating out.</p>
    <button type="button" class="btn primary" onclick={startEdit}>Set budgets</button>
  </div>
{:else}
  <section class="card stack">
    <div class="row between"><span class="big num">{formatMoney(spent, 'JPY')}</span><span class="small muted num">of {formatMoney(total, 'JPY')}</span></div>
    <div class="track" role="progressbar" aria-label="Spent of the budget" aria-valuenow={Math.round(pct(spent, total))} aria-valuemin={0} aria-valuemax={100}>
      <span class="fill" class:over={spent > total} style:width="{pct(spent, total)}%"></span>
      {#if now > 0 && now < 1}<span class="pace" style:left="{now * 100}%"></span>{/if}
    </div>
    <div class="row between xs">
      <span class="num">{spent > total ? `Over by ${formatMoney(spent - total, 'JPY')}` : `${formatMoney(total - spent, 'JPY')} left`}</span>
      {#if now > 0 && now < 1}
        {#if spent <= total * now}<span class="okn"><Icon name="check" size={14} />On pace</span>{:else}<span class="overn"><Icon name="alert" size={14} />Ahead of pace</span>{/if}
      {/if}
    </div>
    {#if now > 0 && now < 1}<p class="xs muted m0">The line marks an even share of the budget for today.</p>{/if}
  </section>

  <section class="card stack cats">
    {#each lines as l (l.categoryId)}
      {@const c = store.category(l.categoryId)}
      <a class="line" href="#/activity?m={month}&c={l.categoryId}">
        <span class="row between small">
          <span class="row strong"><Icon name={c?.icon ?? 'grid'} size={18} />{c?.name ?? '?'}</span>
          <span class="num"><strong>{formatMoney(l.spent, 'JPY')}</strong> <span class="muted">of {formatMoney(l.budget, 'JPY')}</span></span>
        </span>
        <span class="track"><span class="fill" class:over={l.spent > l.budget} style:width="{pct(l.spent, l.budget)}%"></span></span>
        <span class="xs right">
          {#if l.spent > l.budget}<span class="overn"><Icon name="alert" size={14} />Over by {formatMoney(l.spent - l.budget, 'JPY')}</span>
          {:else}<span class="muted">{formatMoney(l.budget - l.spent, 'JPY')} left</span>{/if}
        </span>
      </a>
    {/each}
  </section>
  <div><button type="button" class="btn" onclick={startEdit}><Icon name="edit" size={18} />Edit budgets</button></div>
{/if}

<style>
  .m0 {
    margin: 0;
  }

  h2 {
    margin: 0;
  }

  .pace {
    position: absolute;
    top: -5px;
    bottom: -5px;
    width: 2px;
    margin-left: -1px;
    background: var(--text);
    border-radius: 1px;
  }

  .fill.over {
    background: var(--danger);
  }

  .okn,
  .overn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
  }

  .okn {
    color: var(--ok);
  }

  .overn {
    color: var(--danger);
  }

  .cats {
    gap: 18px;
    margin-top: 1rem;
  }

  .line {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text);
    text-decoration: none;
  }

  .right {
    text-align: right;
  }

  .edit {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .edit li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .edit input {
    width: 8.5rem;
    text-align: right;
  }

  div:has(> .btn) {
    margin-top: 1rem;
  }
</style>
