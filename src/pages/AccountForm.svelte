<script lang="ts">
  import { untrack } from 'svelte';
  import { ACCOUNT_TYPES, DEFAULT_FOREIGN_FEE } from '../lib/constants';
  import { formatMoney, parseAmount, toInput } from '../lib/money';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Account, AccountType, Currency } from '../lib/types';
  import { formatDate, newId, nowIso, today } from '../lib/util';

  let { id }: { id?: string } = $props();
  // The page is re-created (keyed) when the id changes, so reading it once is enough.
  const existing = untrack(() => (id ? store.account(id) : undefined));

  let name = $state(existing?.name ?? '');
  let type = $state<AccountType>(existing?.type ?? 'bank');
  let currency = $state<Currency>(existing?.currency ?? 'JPY');
  // Cards store what's owed as a negative balance; the form shows it as a positive amount owed.
  let openingText = $state(existing ? toInput(existing.type === 'card' ? -existing.opening : existing.opening, existing.currency) : '');
  let openingDate = $state(existing?.openingDate ?? today());
  let topUpFromId = $state(existing?.topUpFromId ?? '');
  let paysFromId = $state(existing?.paysFromId ?? '');
  let feeText = $state(String(existing?.foreignFeePct ?? DEFAULT_FOREIGN_FEE));
  let note = $state(existing?.note ?? '');
  let closed = $state(existing?.closed ?? false);
  let error = $state('');

  const others = $derived(store.openAccounts.filter((a) => a.id !== existing?.id));
  const cards = $derived(others.filter((a) => a.type === 'card' || a.type === 'bank'));
  const banks = $derived(others.filter((a) => a.type === 'bank' || a.type === 'savings'));
  const openingLabel = $derived(
    type === 'card' ? 'Amount owed' : type === 'lent' ? 'Still owed to you' : type === 'investment' ? 'Value' : 'Balance',
  );

  async function save(e: Event) {
    e.preventDefault();
    error = '';
    if (!name.trim()) return void (error = 'Give the account a name.');
    const opening = openingText.trim() === '' ? 0 : parseAmount(openingText, currency);
    if (opening === undefined) return void (error = `“${openingText}” isn't an amount.`);
    const now = nowIso();
    const a: Account = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      type,
      currency,
      opening: type === 'card' ? -opening : opening,
      openingDate,
      order: existing?.order ?? store.accounts.length,
      closed: closed || undefined,
      note: note.trim() || undefined,
      topUpFromId: type === 'prepaid' && topUpFromId ? topUpFromId : undefined,
      paysFromId: type === 'card' && paysFromId ? paysFromId : undefined,
      foreignFeePct: type === 'card' ? Number(feeText) || DEFAULT_FOREIGN_FEE : undefined,
    };
    await store.saveAccount(a);
    toasts.show(existing ? 'Saved.' : `Added ${a.name}.`);
    if (existing) router.back(`/account/${a.id}`);
    else router.go(`/account/${a.id}`, true);
  }

  async function remove() {
    if (!existing) return;
    const used = store.transactionsFor(existing.id).length;
    const msg = used
      ? `${existing.name} has ${used} transactions, so it will be closed (hidden, history kept) instead of deleted. Continue?`
      : `Delete ${existing.name}?`;
    if (!confirm(msg)) return;
    await store.deleteAccount(existing);
    router.go('/accounts', true);
  }
</script>

<h1>{existing ? `Edit ${existing.name}` : 'New account'}</h1>

<form class="stack form" onsubmit={save}>
  <label class="field"><span>Name</span><input bind:value={name} placeholder="e.g. 三井住友銀行, Rakuten Card, PASMO" /></label>

  <div class="grid-2">
    <label class="field"><span>Type</span>
      <select bind:value={type}>
        {#each ACCOUNT_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}
      </select>
    </label>
    <label class="field"><span>Currency</span>
      <select bind:value={currency} disabled={!!existing && store.transactionsFor(existing.id).length > 0}>
        <option value="JPY">Yen (¥)</option>
        <option value="USD">Dollars ($)</option>
      </select>
    </label>
  </div>

  <div class="grid-2">
    <label class="field"><span>{openingLabel}</span><input inputmode="decimal" bind:value={openingText} placeholder="0" /></label>
    <label class="field"><span>At the start of</span><input type="date" bind:value={openingDate} required /></label>
  </div>
  <p class="xs muted">
    {#if type === 'card'}
      What the card owed at the start of {formatDate(openingDate)} (0 if you start with a fresh month). Purchases you add
      from that day raise it; payments from your bank lower it.
    {:else}
      Transactions from {formatDate(openingDate)} on are added to this. Check it any time against your bank app with “Check
      the balance”.
    {/if}
  </p>

  {#if type === 'prepaid'}
    <label class="field"><span>Top-ups are paid with</span>
      <select bind:value={topUpFromId}>
        <option value="">— choose each time —</option>
        {#each cards as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select>
      <span class="xs muted">Each top-up you enter is added to this card automatically (e.g. Rakuten Card via Apple Pay).</span>
    </label>
  {/if}

  {#if type === 'card'}
    <div class="grid-2">
      <label class="field"><span>Paid from</span>
        <select bind:value={paysFromId}>
          <option value="">—</option>
          {#each banks as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </label>
      <label class="field"><span>Fee on foreign purchases (%)</span><input inputmode="decimal" bind:value={feeText} /></label>
    </div>
  {/if}

  <label class="field"><span>Note</span><input bind:value={note} placeholder="Optional" /></label>

  {#if existing}
    <label class="check"><input type="checkbox" bind:checked={closed} /> Closed (hidden from lists and forms; history kept)</label>
    <p class="xs muted">Current balance: {formatMoney(store.balance(existing.id), existing.currency)}</p>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="row">
    <button class="btn primary">Save</button>
    <button type="button" class="btn" onclick={() => router.back('/accounts')}>Cancel</button>
    {#if existing}<button type="button" class="btn danger" onclick={remove}>Delete</button>{/if}
  </div>
</form>

<style>
  .form {
    max-width: 560px;
  }

  p {
    margin: -0.5rem 0 0;
  }
</style>
