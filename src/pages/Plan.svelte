<script lang="ts">
  import BillsList from '../components/BillsList.svelte';
  import BudgetPlan from '../components/BudgetPlan.svelte';
  import GoalsList from '../components/GoalsList.svelte';
  import Icon from '../components/Icon.svelte';
  import MonthPlan from '../components/MonthPlan.svelte';
  import { router } from '../lib/router.svelte';
  import { addMonths, formatMonth, today } from '../lib/util';

  // Sections and the month live in the URL (?s=budget&m=2026-10) so Back keeps them.
  const SECTIONS = [
    { id: 'month', label: 'Month' },
    { id: 'budget', label: 'Budget' },
    { id: 'bills', label: 'Bills' },
    { id: 'goals', label: 'Goals' },
  ];
  const q = $derived(router.route.query);
  const section = $derived(SECTIONS.some((s) => s.id === q.get('s')) ? q.get('s')! : 'month');
  const month = $derived(/^\d{4}-\d{2}$/.test(q.get('m') ?? '') ? q.get('m')! : today().slice(0, 7));
</script>

<h1>Plan</h1>

<div class="seg" role="group" aria-label="Plan sections">
  {#each SECTIONS as s (s.id)}
    <button type="button" class:on={section === s.id} aria-pressed={section === s.id} onclick={() => router.setQuery({ s: s.id === 'month' ? undefined : s.id })}>{s.label}</button>
  {/each}
</div>

{#if section === 'month' || section === 'budget'}
  <div class="row between months">
    <button type="button" class="btn ghost icon" aria-label="Previous month" onclick={() => router.setQuery({ m: addMonths(month, -1) })}><Icon name="back" /></button>
    <h2>{formatMonth(month)}</h2>
    <button type="button" class="btn ghost icon" aria-label="Next month" onclick={() => router.setQuery({ m: addMonths(month, 1) })}><Icon name="fwd" /></button>
  </div>
{/if}

<div class="body">
  {#if section === 'month'}
    {#key month}<MonthPlan {month} />{/key}
  {:else if section === 'budget'}
    {#key month}<BudgetPlan {month} />{/key}
  {:else if section === 'bills'}
    <BillsList />
  {:else}
    <GoalsList />
  {/if}
</div>

<style>
  .seg {
    margin: 0.5rem 0 0.75rem;
    max-width: 560px;
  }

  .months {
    flex-wrap: nowrap;
    max-width: 560px;
  }

  .months h2 {
    margin: 0;
  }

  .body {
    max-width: 760px;
    margin-top: 0.5rem;
  }
</style>
