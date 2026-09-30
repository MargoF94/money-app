<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import { DEFAULT_FOREIGN_FEE } from '../lib/constants';
  import { estimateYen, yenPerDollar } from '../lib/fx';
  import { formatMoney, parseAmount, symbolOf, toInput } from '../lib/money';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Transaction, TxKind } from '../lib/types';
  import { addDays, newId, today } from '../lib/util';

  let { id }: { id?: string } = $props();

  // The page is re-created (keyed) when the id changes, so reading it once is enough.
  const existing = untrack(() => (id ? store.transaction(id) : undefined));
  const q = router.route.query;

  function lastUsedAccount(): string | undefined {
    const recent = store.transactions.find((t) => t.kind !== 'transfer' && store.account(t.accountId) && !store.account(t.accountId)?.closed);
    return recent?.accountId;
  }

  // ---- form state --------------------------------------------------------------
  const presetTo = q.get('to') ?? undefined;
  const presetToAccount = store.account(presetTo);
  let kind = $state<TxKind>(existing?.kind ?? ((q.get('kind') as TxKind | null) ?? 'expense'));
  let accountId = $state(
    existing?.accountId ??
      (presetToAccount?.topUpFromId && store.account(presetToAccount.topUpFromId) ? presetToAccount.topUpFromId : undefined) ??
      q.get('account') ??
      (store.account(store.settings.defaultAccountId) ? store.settings.defaultAccountId : undefined) ??
      lastUsedAccount() ??
      store.openAccounts[0]?.id ??
      '',
  );
  let toAccountId = $state(existing?.toAccountId ?? presetTo ?? '');
  const account = $derived(store.account(accountId));
  const toAccount = $derived(store.account(toAccountId));
  const currency = $derived(account?.currency ?? 'JPY');

  let amountText = $state(existing ? toInput(Math.abs(existing.amount), store.account(existing.accountId)?.currency ?? 'JPY') : '');
  let toAmountText = $state(existing?.toAmount !== undefined ? toInput(existing.toAmount, store.account(existing.toAccountId)?.currency ?? 'JPY') : '');
  let adjustSign = $state(existing && existing.kind === 'adjustment' && existing.amount < 0 ? -1 : 1);
  let categoryId = $state(existing?.categoryId ?? '');
  let date = $state(existing?.date ?? today());
  let payee = $state(existing?.payee ?? '');
  let note = $state(existing?.note ?? '');
  let refund = $state(existing?.refund ?? false);
  let splitting = $state(!!existing?.splits?.length);
  let splits = $state(
    existing?.splits?.map((s) => ({ categoryId: s.categoryId, text: toInput(s.amount, 'JPY') })) ?? [
      { categoryId: '', text: '' },
      { categoryId: '', text: '' },
    ],
  );
  // Dollar purchase on a yen account (estimated until the statement gives the real amount).
  let inDollars = $state(!!existing?.foreign);
  let dollarsText = $state(existing?.foreign ? toInput(existing.foreign.amount, 'USD') : '');
  let rate = $state<number | undefined>(existing?.foreign?.rate);
  let finalAmount = $state(existing?.foreign ? !existing.foreign.estimated : false);
  let rateError = $state('');
  let showAll = $state(false);
  let error = $state('');

  const isTopUp = $derived(kind === 'transfer' && toAccount?.type === 'prepaid');
  const needsToAmount = $derived(kind === 'transfer' && !!toAccount && !!account && toAccount.currency !== account.currency);
  const amount = $derived(parseAmount(amountText, currency));
  const canDollars = $derived(kind === 'expense' && currency === 'JPY');

  const catKind = $derived(kind === 'income' ? 'income' : 'expense');
  const allCats = $derived(store.frequentCategories(catKind));
  const shownCats = $derived(showAll ? allCats : allCats.slice(0, 7));

  const splitTotal = $derived(splits.reduce((s, x) => s + (parseAmount(x.text, currency) ?? 0), 0));

  // When the "to" account is a prepaid card with a top-up source, pay from it.
  // Only when the "to" account changes, so choosing another "From" by hand sticks.
  $effect(() => {
    const to = toAccount;
    if (kind !== 'transfer' || to?.type !== 'prepaid' || !to.topUpFromId || existing) return;
    const from = store.account(to.topUpFromId);
    untrack(() => {
      if (from && accountId !== from.id) accountId = from.id;
    });
  });

  // Estimate the yen amount from the dollar price, the day's rate and the card's fee.
  $effect(() => {
    if (!inDollars || finalAmount) return;
    const cents = parseAmount(dollarsText, 'USD');
    const fee = account?.foreignFeePct ?? DEFAULT_FOREIGN_FEE;
    const d = date;
    if (!cents) return;
    rateError = '';
    void yenPerDollar(d).then((r) => {
      if (r === null) {
        rateError = 'Couldn’t get the exchange rate (offline?). Type the yen amount, or try again later.';
        return;
      }
      rate = r;
      amountText = String(estimateYen(cents, r, fee));
    });
  });

  function pickPayee() {
    const match = store.payees.find((p) => p.name.normalize('NFKC').toLowerCase() === payee.trim().normalize('NFKC').toLowerCase());
    if (match?.categoryId && !categoryId && store.category(match.categoryId)?.kind === catKind) categoryId = match.categoryId;
  }

  function build(): Transaction | null {
    error = '';
    if (!account) return (error = 'Choose an account.'), null;
    if (!amount || amount <= 0) return (error = 'Type an amount, e.g. 1540 or 1200+340.'), null;
    const now = new Date().toISOString();
    const t: Transaction = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      date,
      kind,
      accountId,
      amount: kind === 'adjustment' ? adjustSign * amount : amount,
      payee: payee.trim() || undefined,
      note: note.trim() || undefined,
      tagIds: existing?.tagIds,
    };
    if (kind === 'transfer') {
      if (!toAccount) return (error = 'Choose where the money went.'), null;
      if (toAccount.id === account.id) return (error = 'Choose two different accounts.'), null;
      t.toAccountId = toAccount.id;
      if (needsToAmount) {
        const to = parseAmount(toAmountText, toAccount.currency);
        if (!to || to <= 0) return (error = `Type the amount received in ${toAccount.currency}.`), null;
        t.toAmount = to;
      }
      if (isTopUp) t.topUp = true;
    } else if (kind === 'expense' || kind === 'income') {
      if (splitting && kind === 'expense') {
        const parts = splits
          .map((s) => ({ categoryId: s.categoryId, amount: parseAmount(s.text, currency) ?? 0 }))
          .filter((s) => s.amount > 0);
        if (parts.some((p) => !p.categoryId)) return (error = 'Choose a category for each part.'), null;
        if (parts.reduce((s, p) => s + p.amount, 0) !== amount) return (error = 'The parts must add up to the amount.'), null;
        t.splits = parts;
      } else if (categoryId) t.categoryId = categoryId;
      if (kind === 'expense' && refund) t.refund = true;
      if (kind === 'expense' && inDollars && currency === 'JPY') {
        const cents = parseAmount(dollarsText, 'USD');
        if (!cents) return (error = 'Type the price in dollars.'), null;
        t.foreign = { amount: cents, currency: 'USD', rate, estimated: !finalAmount };
      }
    }
    return t;
  }

  async function save(again = false) {
    const t = build();
    if (!t) return;
    await store.saveTransaction(t);
    toasts.show(existing ? 'Saved.' : 'Added.');
    if (again) {
      amountText = '';
      dollarsText = '';
      payee = '';
      note = '';
      refund = false;
      splitting = false;
      categoryId = '';
    } else router.back('/activity');
  }

  async function remove() {
    if (!existing || !confirm('Delete this transaction?')) return;
    await store.deleteTransaction(existing);
    toasts.show('Deleted.');
    router.back('/activity');
  }

  function setKind(k: TxKind) {
    kind = k;
    if (store.category(categoryId)?.kind !== (k === 'income' ? 'income' : 'expense')) categoryId = '';
  }

  const kinds: { value: TxKind; label: string }[] = [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'transfer', label: 'Transfer' },
  ];
</script>

<div class="head row between">
  <h1>{existing ? 'Edit' : isTopUp ? 'Top up' : 'Add'}</h1>
  <button type="button" class="btn ghost icon" aria-label="Close" onclick={() => router.back('/')}><Icon name="close" /></button>
</div>

{#if store.openAccounts.length === 0}
  <div class="card empty">
    <p>Add an account first — for example your bank, Rakuten Card or PASMO.</p>
    <a class="btn primary" href="#/account/new">Add an account</a>
  </div>
{:else}
  <form class="stack form" onsubmit={(e) => (e.preventDefault(), save())}>
    {#if kind === 'adjustment'}
      <p class="small muted">Balance correction: changes the balance without counting as spending or income.</p>
    {:else}
      <div class="seg" role="group" aria-label="Kind">
        {#each kinds as k (k.value)}
          <button type="button" class:on={kind === k.value} aria-pressed={kind === k.value} onclick={() => setKind(k.value)}>{k.label}</button>
        {/each}
      </div>
    {/if}

    {#if kind === 'transfer'}
      <label class="field"><span>From</span>
        <select bind:value={accountId}>
          {#each store.openAccounts as a (a.id)}<option value={a.id}>{a.name} · {formatMoney(store.balance(a.id), a.currency)}</option>{/each}
        </select>
      </label>
    {/if}

    <label class="field">
      <span>{kind === 'transfer' ? 'Amount sent' : 'Amount'}</span>
      <span class="amount-box">
        <span class="cur">{symbolOf(currency)}</span>
        <input class="amount" inputmode="decimal" autocomplete="off" placeholder="0" bind:value={amountText} readonly={inDollars && !finalAmount && canDollars} />
      </span>
      {#if kind === 'adjustment'}
        <span class="row">
          <label class="check"><input type="radio" name="sign" checked={adjustSign === 1} onchange={() => (adjustSign = 1)} /> Add</label>
          <label class="check"><input type="radio" name="sign" checked={adjustSign === -1} onchange={() => (adjustSign = -1)} /> Take away</label>
        </span>
      {:else if !inDollars}
        <span class="xs muted">Sums work too: 1200+340</span>
      {/if}
    </label>

    {#if canDollars}
      <label class="check"><input type="checkbox" bind:checked={inDollars} /> Paid in dollars</label>
      {#if inDollars}
        <div class="card stack dollars">
          <label class="field"><span>Price in dollars</span><input inputmode="decimal" placeholder="$0.00" bind:value={dollarsText} /></label>
          {#if rate && !finalAmount}
            <p class="xs muted">
              Estimate: {rate.toFixed(2)} yen per $ plus {account?.foreignFeePct ?? DEFAULT_FOREIGN_FEE}% card fee. Marked
              “estimated” until the real yen amount is known from the statement.
            </p>
          {/if}
          {#if rateError}<p class="xs error">{rateError}</p>{/if}
          <label class="check small"><input type="checkbox" bind:checked={finalAmount} /> I know the final yen amount (type it above)</label>
        </div>
      {/if}
    {/if}

    {#if kind === 'transfer'}
      <label class="field"><span>To</span>
        <select bind:value={toAccountId}>
          <option value="" disabled>Choose…</option>
          {#each store.openAccounts.filter((a) => a.id !== accountId) as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </label>
      {#if needsToAmount && toAccount}
        <label class="field"><span>Amount received ({symbolOf(toAccount.currency)})</span><input inputmode="decimal" bind:value={toAmountText} /></label>
      {/if}
      <p class="xs muted">
        {#if isTopUp}A top-up moves money onto {toAccount?.name}; it isn't spending. What you buy with it is.
        {:else}Transfers move money between your own accounts (card payments too), so they aren't spending or income.{/if}
      </p>
    {:else if kind !== 'adjustment'}
      {#if splitting && kind === 'expense'}
        <div class="field">
          <span class="label">Split into categories</span>
          {#each splits as s, i (i)}
            <div class="row split">
              <select bind:value={s.categoryId} aria-label="Category {i + 1}">
                <option value="">Category…</option>
                {#each allCats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
              </select>
              <input inputmode="decimal" placeholder="0" bind:value={s.text} aria-label="Amount {i + 1}" />
            </div>
          {/each}
          <div class="row between small">
            <button type="button" class="btn small" onclick={() => splits.push({ categoryId: '', text: '' })}>Add a part</button>
            <span class="muted num">{formatMoney(splitTotal, currency)} of {formatMoney(amount ?? 0, currency)}</span>
          </div>
        </div>
      {:else}
        <div class="field">
          <span class="label">Category</span>
          <div class="cats">
            {#each shownCats as c (c.id)}
              <button type="button" class="cat-tile" class:on={categoryId === c.id} aria-pressed={categoryId === c.id} onclick={() => (categoryId = categoryId === c.id ? '' : c.id)}>
                <Icon name={c.icon} size={22} /><span>{c.name}</span>
              </button>
            {/each}
            {#if allCats.length > 7}
              <button type="button" class="cat-tile" onclick={() => (showAll = !showAll)}>
                <Icon name={showAll ? 'up' : 'more'} size={22} /><span>{showAll ? 'Fewer' : 'More'}</span>
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <label class="field"><span>Account</span>
        <select bind:value={accountId}>
          {#each store.openAccounts as a (a.id)}<option value={a.id}>{a.name}{a.currency === 'USD' ? ' ($)' : ''}</option>{/each}
        </select>
      </label>
    {/if}

    <div class="field">
      <span class="label">Date</span>
      <div class="row">
        <button type="button" class="chip" class:accent={date === today()} onclick={() => (date = today())}>Today</button>
        <button type="button" class="chip" class:accent={date === addDays(today(), -1)} onclick={() => (date = addDays(today(), -1))}>Yesterday</button>
        <input type="date" class="date" bind:value={date} aria-label="Date" required />
      </div>
    </div>

    {#if kind !== 'transfer'}
      <label class="field"><span>{kind === 'income' ? 'From' : 'Payee'}</span>
        <input list="payees" autocomplete="off" bind:value={payee} onchange={pickPayee} placeholder="e.g. Lawson" />
        <datalist id="payees">{#each store.payees.slice(0, 200) as p (p.name)}<option value={p.name}></option>{/each}</datalist>
      </label>
    {/if}

    <label class="field"><span>Note</span><input bind:value={note} placeholder="Optional" /></label>

    {#if kind === 'expense'}
      <div class="row">
        <label class="check"><input type="checkbox" bind:checked={refund} /> Refund (money back)</label>
        <button type="button" class="btn small" onclick={() => (splitting = !splitting)}><Icon name="grid" size={16} />{splitting ? 'One category' : 'Split'}</button>
      </div>
    {/if}

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="foot row">
      {#if existing}
        <button type="button" class="btn danger" onclick={remove}><Icon name="trash" size={18} />Delete</button>
      {:else}
        <button type="button" class="btn grow" onclick={() => save(true)}>Save &amp; add another</button>
      {/if}
      <button class="btn primary grow">Save</button>
    </div>
  </form>
{/if}

<style>
  .head {
    margin-bottom: 0.75rem;
  }

  .head h1 {
    margin: 0;
  }

  .form {
    max-width: 560px;
  }

  .amount-box {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 14px;
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: var(--radius);
  }

  .cur {
    font-size: 1.6rem;
    color: var(--text-2);
  }

  .amount {
    border: none;
    background: transparent;
    font-size: 2.4rem;
    font-weight: 600;
    padding: 0;
    min-height: 0;
    font-variant-numeric: tabular-nums;
  }

  .amount:focus {
    outline: none;
  }

  .dollars {
    gap: 0.6rem;
  }

  .cats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .cat-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 68px;
    padding: 6px 2px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.75rem;
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
  }

  .cat-tile.on {
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .split select {
    flex: 2;
  }

  .split input {
    flex: 1;
  }

  .date {
    width: auto;
    flex: 1;
    min-width: 9rem;
  }

  .foot {
    flex-wrap: nowrap;
    margin-top: 0.5rem;
  }
</style>
