<script lang="ts">
  import { formatMoney, parseAmount, toInput } from '../lib/money';
  import { goalProgress } from '../lib/plan';
  import { store } from '../lib/store.svelte';
  import type { Goal } from '../lib/types';
  import { formatMonth, newId, nowIso, today } from '../lib/util';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

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
  <section class="card stack goals">
    {#each store.goals as g (g.id)}
      {@const p = goalProgress(g, g.accountId ? store.balance(g.accountId) : undefined, today())}
      <button type="button" class="goal" class:done={g.done} onclick={() => open(g)}>
        <span class="row between"><span class="row strong"><Icon name={g.done ? 'checkCircle' : 'target'} size={18} />{g.name}</span><span class="num strong">{Math.round(p.pct)}%</span></span>
        <span class="track"><span class="fill" style:width="{p.pct}%"></span></span>
        <span class="row between xs muted">
          <span class="num"><strong class="txt">{formatMoney(p.saved, 'JPY')}</strong> of {formatMoney(g.target, 'JPY')}</span>
          <span>{g.accountId ? `in ${store.account(g.accountId)?.name ?? '?'}` : ''}{g.by ? ` · by ${formatMonth(g.by)}` : ''}</span>
        </span>
        {#if !g.done && p.perMonth && p.saved < g.target}<span class="xs muted">Save {formatMoney(p.perMonth, 'JPY')} a month to get there</span>{/if}
      </button>
    {/each}
  </section>
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

  .txt {
    color: var(--text);
  }
</style>
