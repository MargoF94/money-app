<script lang="ts">
  import CardPanel from '../components/CardPanel.svelte';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import TxRow from '../components/TxRow.svelte';
  import { ACCOUNT_TYPE } from '../lib/constants';
  import { formatMoney, parseAmount } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import { newId, nowIso, today } from '../lib/util';

  let { id }: { id: string } = $props();

  const account = $derived(store.account(id));
  const balance = $derived(store.balance(id));
  const txs = $derived(store.transactionsFor(id));
  let shown = $state(50);

  // "Check the balance": type what the bank app / Wallet shows; the difference is recorded.
  let checking = $state(false);
  let actualText = $state('');
  let asSpending = $state(true);
  let checkCategory = $state('cat-transport');
  const actual = $derived(account ? parseAmount(actualText, account.currency) : undefined);
  const diff = $derived(actual === undefined || !account ? 0 : (account.type === 'card' ? -actual : actual) - balance);

  async function recordCheck() {
    if (!account || actual === undefined || diff === 0) return void (checking = false);
    const now = nowIso();
    const spending = asSpending && diff < 0 && account.type !== 'card';
    await store.saveTransaction({
      id: newId(),
      createdAt: now,
      updatedAt: now,
      date: today(),
      kind: spending ? 'expense' : 'adjustment',
      accountId: account.id,
      amount: spending ? -diff : diff,
      categoryId: spending ? checkCategory : undefined,
      note: 'From checking the balance',
    });
    toasts.show('Balance updated.');
    checking = false;
    actualText = '';
  }

  const actions = $derived.by(() => {
    if (!account) return [];
    const list: { href: string; icon: string; label: string }[] = [];
    if (account.type === 'prepaid') list.push({ href: `#/add?kind=transfer&to=${id}`, icon: 'plus', label: 'Top up' });
    if (account.type === 'card')
      list.push({ href: `#/add?kind=transfer&to=${id}${account.paysFromId ? `&account=${account.paysFromId}` : ''}`, icon: 'check', label: 'Card payment' });
    if (account.type === 'lent') list.push({ href: `#/add?kind=transfer&account=${id}`, icon: 'income', label: 'Paid back' });
    if (account.type !== 'lent') list.push({ href: `#/add?account=${id}`, icon: 'plus', label: 'Add expense' });
    return list;
  });
</script>

{#if !account}
  <div class="card empty"><p>This account doesn't exist (any more).</p><a href="#/accounts">Accounts</a></div>
{:else}
  <a class="link" href="#/accounts"><Icon name="back" size={16} />Accounts</a>
  <div class="row between">
    <div>
      <h1>{account.name}</h1>
      <span class="small muted">{ACCOUNT_TYPE[account.type].label} · {account.currency === 'JPY' ? 'yen' : 'dollars'}{account.closed ? ' · closed' : ''}</span>
    </div>
    <a class="btn icon" href="#/account/{id}/edit" aria-label="Edit account"><Icon name="edit" /></a>
  </div>

  <section class="card bal">
    <span class="muted">{account.type === 'card' ? 'You owe' : account.type === 'lent' ? 'Still owed to you' : 'Balance'}</span>
    <span class="hero num">{formatMoney(account.type === 'card' ? -balance : balance, account.currency)}</span>
    {#if account.type === 'prepaid' && account.topUpFromId}
      <span class="xs muted">Top-ups are charged to {store.account(account.topUpFromId)?.name}.</span>
    {/if}
  </section>

  <div class="row actions">
    {#each actions as a (a.label)}<a class="btn" href={a.href}><Icon name={a.icon} size={18} />{a.label}</a>{/each}
    <button type="button" class="btn" onclick={() => (checking = true)}><Icon name="scale" size={18} />Check the balance</button>
  </div>

  {#if account.type === 'card'}<div class="stack card-panel"><CardPanel card={account} /></div>{/if}

  <div class="sec-head"><h2>Transactions</h2><span class="small muted">{txs.length}</span></div>
  {#if txs.length === 0}
    <p class="muted">Nothing yet.</p>
  {:else}
    <div class="card flush">
      {#each txs.slice(0, shown) as t (t.id)}<TxRow tx={t} accountId={id} showDate />{/each}
    </div>
    {#if txs.length > shown}<button type="button" class="btn" onclick={() => (shown += 100)}>Show more</button>{/if}
  {/if}

  <Modal open={checking} title="Check the balance" onclose={() => (checking = false)}>
    <div class="stack">
      <p class="small">
        Type the {account.type === 'card' ? 'amount owed' : 'balance'} you see now (bank app, Wallet…). The app shows
        {formatMoney(account.type === 'card' ? -balance : balance, account.currency)}.
      </p>
      <label class="field"><span>{account.type === 'card' ? 'Owed now' : 'Balance now'}</span><input inputmode="decimal" bind:value={actualText} /></label>
      {#if actual !== undefined && diff !== 0}
        <p class="small"><strong>{formatMoney(diff, account.currency, true)}</strong> difference.</p>
        {#if diff < 0 && account.type !== 'card'}
          <label class="check"><input type="radio" name="how" checked={asSpending} onchange={() => (asSpending = true)} /> Record it as spending in</label>
          <select bind:value={checkCategory} disabled={!asSpending} aria-label="Category">
            {#each store.categories.filter((c) => c.kind === 'expense') as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
          <label class="check"><input type="radio" name="how" checked={!asSpending} onchange={() => (asSpending = false)} /> Just correct the balance (not spending)</label>
        {/if}
      {:else if actual !== undefined}
        <p class="small ok">That matches.</p>
      {/if}
    </div>
    {#snippet footer()}
      <button type="button" class="btn" onclick={() => (checking = false)}>Cancel</button>
      <button type="button" class="btn primary" disabled={actual === undefined} onclick={recordCheck}>Save</button>
    {/snippet}
  </Modal>
{/if}

<style>
  h1 {
    margin: 0;
  }

  .link {
    margin-bottom: 0.25rem;
  }

  .bal {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 1rem 0;
  }

  .actions {
    margin-bottom: 1.5rem;
  }

  .sec-head {
    margin-bottom: 0.5rem;
  }

.card-panel {
    margin-bottom: 1.5rem;
  }

  .ok {
    color: var(--ok);
  }
</style>
