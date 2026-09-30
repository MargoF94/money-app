<script lang="ts">
  import { formatMoney, parseAmount, toInput } from '../lib/money';
  import { goalGroups, moveGoal } from '../lib/plan';
  import { store } from '../lib/store.svelte';
  import type { Goal } from '../lib/types';
  import { formatMonth, newId, nowIso, today } from '../lib/util';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  const groups = $derived(goalGroups(store.goals, (id) => store.balance(id), today()));
  const reached = $derived(store.goals.filter((g) => g.done));

  async function move(g: Goal, dir: -1 | 1) {
    const changed = moveGoal(store.goals, g, dir);
    if (changed.length) await store.put('goals', changed);
  }

  let editing = $state<Goal | null>(null);
  let name = $state('');
  let targetText = $state('');
  let accountId = $state('');
  let savedText = $state('');
  let by = $state('');
  let done = $state(false);
  let error = $state('');

  function open(g?: Goal) {
    const now = nowIso();
    editing = g ?? { id: newId(), createdAt: now, updatedAt: now, name: '', target: 0 };
    name = g?.name ?? '';
    targetText = g ? toInput(g.target, 'JPY') : '';
    accountId = g?.accountId ?? '';
    savedText = g?.saved !== undefined ? toInput(g.saved, 'JPY') : '';
    by = g?.by ?? '';
    done = g?.done ?? false;
    error = '';
  }

  async function save() {
    if (!editing) return;
    const target = parseAmount(targetText, 'JPY');
    if (!name.trim()) return void (error = 'Give the goal a name.');
    if (!target || target <= 0) return void (error = 'Type the amount to reach.');
    const saved = accountId ? undefined : (parseAmount(savedText || '0', 'JPY') ?? 0);
    await store.saveGoal({ ...editing, name: name.trim(), target, accountId: accountId || undefined, saved, by: by || undefined, done: done || undefined });
    editing = null;
  }

  async function remove() {
    if (editing && confirm(`Delete the goal “${editing.name}”?`)) {
      await store.deleteGoal(editing);
      editing = null;
    }
  }
</script>

<div class="sec-head"><h2>Goals</h2><button type="button" class="btn small" onclick={() => open()}><Icon name="plus" size={16} />Add</button></div>

{#if store.goals.length === 0}
  <div class="card empty">
    <p>Save up for something: a trip, an emergency fund, the tattoo. Link a savings account, or record what you've put aside yourself.</p>
    <button type="button" class="btn primary" onclick={() => open()}>Add a goal</button>
  </div>
{:else}
  {#each groups as grp (grp.accountId ?? grp.goals[0].goal.id)}
    <section class="card stack goals">
      {#if grp.accountId}
        <!-- Goals saved in the same account share its balance. -->
        <div class="stack-s">
          <span class="row between"><span class="row strong"><Icon name="safe" size={18} />{store.account(grp.accountId)?.name ?? '?'}</span><span class="num strong">{Math.round(grp.pct)}%</span></span>
          <span class="track"><span class="fill" style:width="{grp.pct}%"></span></span>
          <span class="row between xs muted">
            <span class="num"><strong class="txt">{formatMoney(grp.saved, 'JPY')}</strong> of {formatMoney(grp.target, 'JPY')}</span>
            <span>{grp.goals.length} goals together</span>
          </span>
        </div>
        <div class="divider"></div>
        <p class="xs muted m0">The balance fills these goals from the top. Use the arrows to change the order.</p>
      {/if}
      {#each grp.goals as { goal: g, progress: p }, i (g.id)}
        <div class="goal-row">
        <button type="button" class="goal" class:sub={!!grp.accountId} onclick={() => open(g)}>
          <span class="row between"><span class="row" class:strong={!grp.accountId}>{#if !grp.accountId}<Icon name="target" size={18} />{/if}{g.name}</span><span class="num">{Math.round(p.pct)}%</span></span>
          <span class="track" class:thin={!!grp.accountId}><span class="fill" style:width="{p.pct}%"></span></span>
          <span class="row between xs muted">
            <span class="num"><strong class="txt">{formatMoney(p.saved, 'JPY')}</strong> of {formatMoney(g.target, 'JPY')}</span>
            <span>{g.by ? `by ${formatMonth(g.by)}` : ''}</span>
          </span>
          {#if p.perMonth && p.saved < g.target}<span class="xs muted">Save {formatMoney(p.perMonth, 'JPY')} a month to get there</span>{/if}
        </button>
        {#if grp.goals.length > 1}
          <span class="arrows">
            <button type="button" class="btn ghost icon" aria-label="Move {g.name} up" disabled={i === 0} onclick={() => move(g, -1)}><Icon name="up" size={18} /></button>
            <button type="button" class="btn ghost icon" aria-label="Move {g.name} down" disabled={i === grp.goals.length - 1} onclick={() => move(g, 1)}><Icon name="chevron" size={18} /></button>
          </span>
        {/if}
        </div>
      {/each}
    </section>
  {/each}
  {#if reached.length}
    <section class="card stack goals">
      <h3 class="m0">Reached</h3>
      {#each reached as g (g.id)}
        <button type="button" class="goal done" onclick={() => open(g)}>
          <span class="row between"><span class="row"><Icon name="checkCircle" size={18} />{g.name}</span><span class="num">{formatMoney(g.target, 'JPY')}</span></span>
        </button>
      {/each}
    </section>
  {/if}
{/if}

<Modal open={!!editing} title={editing && store.goals.some((g) => g.id === editing?.id) ? 'Edit goal' : 'New goal'} onclose={() => (editing = null)}>
  <div class="stack">
    <label class="field"><span>Name</span><input bind:value={name} placeholder="e.g. Trip, Emergency fund" /></label>
    <label class="field"><span>Amount to reach (¥)</span><input inputmode="numeric" bind:value={targetText} /></label>
    <label class="field"><span>Saved in</span>
      <select bind:value={accountId}>
        <option value="">I'll record it myself</option>
        {#each store.openAccounts.filter((a) => a.currency === 'JPY') as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select>
    </label>
    {#if !accountId}<label class="field"><span>Saved so far (¥)</span><input inputmode="numeric" bind:value={savedText} placeholder="0" /></label>{/if}
    <label class="field"><span>Reach it by (optional)</span><input type="month" bind:value={by} /></label>
    <label class="check"><input type="checkbox" bind:checked={done} /> Reached</label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {#snippet footer()}
    {#if store.goals.some((g) => g.id === editing?.id)}<button type="button" class="btn danger" onclick={remove}>Delete</button>{/if}
    <button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
    <button type="button" class="btn primary" onclick={save}>Save</button>
  {/snippet}
</Modal>

<style>
  .sec-head {
    margin-bottom: 0.75rem;
  }

  .goals {
    gap: 18px;
  }

  .goal {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .goal.done {
    opacity: 0.65;
  }

  .goals + .goals {
    margin-top: 1rem;
  }

  .stack-s {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .m0 {
    margin: 0;
  }

  .goal-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .goal-row .goal {
    flex: 1;
    min-width: 0;
  }

  .arrows {
    display: flex;
    flex-direction: column;
  }

  .arrows .btn {
    min-height: 36px;
    width: 40px;
  }

  .goal.sub {
    padding-left: 12px;
    border-left: 2px solid var(--border);
  }

  .track.thin {
    height: 6px;
  }

  .txt {
    color: var(--text);
  }
</style>
