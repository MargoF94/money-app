<script lang="ts">
  import { amountFor } from '../lib/ledger';
  import { formatMoney } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import type { Transaction } from '../lib/types';
  import { formatDate } from '../lib/util';
  import Icon from './Icon.svelte';

  // One transaction in a list. `accountId` shows the amount as seen from that account.
  let { tx, accountId, showDate = false }: { tx: Transaction; accountId?: string; showDate?: boolean } = $props();

  const account = $derived(store.account(tx.accountId));
  const to = $derived(store.account(tx.toAccountId));
  const category = $derived(store.category(tx.categoryId));
  const icon = $derived(
    tx.kind === 'transfer' ? 'transfer' : tx.kind === 'adjustment' ? 'scale' : tx.splits?.length ? 'grid' : (category?.icon ?? 'grid'),
  );
  const title = $derived(
    tx.payee?.trim() ||
      (tx.kind === 'transfer' ? (tx.topUp ? `${to?.name ?? 'Account'} top-up` : 'Transfer') : tx.kind === 'adjustment' ? 'Balance correction' : (category?.name ?? 'No category')),
  );
  const sub = $derived.by(() => {
    const parts: string[] = [];
    if (tx.kind === 'transfer') parts.push(`${account?.name ?? '?'} → ${to?.name ?? '?'}`);
    else {
      if (tx.splits?.length) parts.push(`Split: ${tx.splits.map((s) => store.category(s.categoryId)?.name ?? '?').join(', ')}`);
      else if (tx.payee?.trim() && category) parts.push(category.name);
      if (tx.refund) parts.push('refund');
      if (!accountId) parts.push(account?.name ?? '?');
    }
    if (showDate) parts.push(formatDate(tx.date));
    return parts.join(' · ');
  });
  const currency = $derived(
    accountId && accountId === tx.toAccountId ? (to?.currency ?? 'JPY') : (account?.currency ?? 'JPY'),
  );
  const shown = $derived(amountFor(tx, accountId));
</script>

<a class="tx" href="#/tx/{tx.id}">
  <span class="cat"><Icon name={icon} size={18} /></span>
  <span class="main">
    <span class="name">{title}</span>
    {#if sub}<span class="sub">{sub}</span>{/if}
  </span>
  <span class="right">
    {#if tx.kind === 'transfer' && !accountId}
      <span class="amt xfer">{formatMoney(tx.amount, account?.currency ?? 'JPY')}</span>
    {:else}
      <span class="amt" class:in={shown > 0 && tx.kind !== 'transfer'} class:xfer={tx.kind === 'transfer'}>
        {formatMoney(shown, currency, true)}
      </span>
    {/if}
    {#if tx.foreign}
      <span class="xs muted num">{formatMoney(tx.foreign.amount, tx.foreign.currency)}{tx.foreign.estimated ? ' · estimated' : ''}</span>
    {/if}
  </span>
</a>

<style>
  .tx {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    color: var(--text);
    text-decoration: none;
  }

  .tx + :global(.tx) {
    border-top: 1px solid var(--border);
  }

  .cat {
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

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
</style>
