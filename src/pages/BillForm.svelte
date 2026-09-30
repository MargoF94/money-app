<script lang="ts">
  import { untrack } from 'svelte';
  import { billTxId, dueDates } from '../lib/bills';
  import { formatMoney, parseAmount, symbolOf, toInput } from '../lib/money';
  import { router } from '../lib/router.svelte';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Bill, BillRepeat } from '../lib/types';
  import { formatDate, newId, nowIso, plural, today } from '../lib/util';

  let { id }: { id?: string } = $props();
  // The page is re-created (keyed) when the id changes, so reading it once is enough.
  const existing = untrack(() => (id ? store.bills.find((b) => b.id === id) : undefined));

  const rakuten = store.openAccounts.find((a) => a.type === 'card');
  let name = $state(existing?.name ?? '');
  let accountId = $state(existing?.accountId ?? rakuten?.id ?? store.openAccounts[0]?.id ?? '');
  const account = $derived(store.account(accountId));
  const currency = $derived(account?.currency ?? 'JPY');
  let amountText = $state(existing ? toInput(existing.amount, store.account(existing.accountId)?.currency ?? 'JPY') : '');
  let categoryId = $state(existing?.categoryId ?? (store.category('cat-subs') ? 'cat-subs' : ''));
  let repeat = $state<BillRepeat>(existing?.repeat ?? 'monthly');
  let every = $state(existing?.every ?? 1);
  let start = $state(existing?.start ?? today());
  let end = $state(existing?.end ?? '');
  let auto = $state(existing?.auto ?? true);
  let note = $state(existing?.note ?? '');
  let error = $state('');

  // Past payments that saving would add now (so a past first date is a visible choice).
  const catchUp = $derived.by(() => {
    if (!auto || !start) return [];
    const draft = { id: existing?.id ?? '_', start, end: end || undefined, repeat, every } as Bill;
    const ids = new Set(store.data.transactions.map((t) => t.id));
    const from = account && account.openingDate > start ? account.openingDate : start;
    return dueDates(draft, from, today()).filter((d) => !ids.has(billTxId(draft.id, d)));
  });

  async function save(e: Event) {
    e.preventDefault();
    error = '';
    const amount = parseAmount(amountText, currency);
    if (!name.trim()) return void (error = 'Give it a name, e.g. Netflix.');
    if (!amount || amount <= 0) return void (error = 'Type the amount.');
    if (!account) return void (error = 'Choose the account it is paid from.');
    if (end && end < start) return void (error = 'The last payment is before the first one.');
    const now = nowIso();
    const b: Bill = {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      name: name.trim(),
      amount,
      accountId,
      categoryId: categoryId || undefined,
      repeat,
      every: repeat === 'monthly' && every > 1 ? every : undefined,
      start,
      end: end || undefined,
      auto,
      note: note.trim() || undefined,
    };
    const added = catchUp.length;
    await store.saveBill(b);
    toasts.show(added ? `Saved. Added ${plural(added, 'payment')} already due.` : 'Saved.');
    router.go('/plan?s=bills', true);
  }

  async function stop() {
    if (!existing || !confirm(`Stop ${existing.name}? Payments already added stay; no new ones will be added.`)) return;
    await store.deleteBill(existing);
    toasts.show(`${existing.name} stopped.`);
    router.go('/plan?s=bills', true);
  }
</script>

<h1>{existing ? existing.name : 'New subscription or bill'}</h1>

<form class="stack form" onsubmit={save}>
  <label class="field"><span>Name</span><input bind:value={name} placeholder="e.g. Netflix, iCloud+, gym, Paidy" /></label>

  <div class="grid-2">
    <label class="field"><span>Amount ({symbolOf(currency)})</span><input inputmode="decimal" bind:value={amountText} placeholder="0" /></label>
    <label class="field"><span>Paid with</span>
      <select bind:value={accountId}>
        {#each store.openAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
      </select>
    </label>
  </div>

  <label class="field"><span>Category</span>
    <select bind:value={categoryId}>
      <option value="">No category</option>
      {#each store.categories.filter((c) => c.kind === 'expense') as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </label>

  <div class="grid-2">
    <label class="field"><span>Repeats</span>
      <select bind:value={repeat}>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </label>
    {#if repeat === 'monthly'}
      <label class="field"><span>Every</span>
        <select bind:value={every}>
          <option value={1}>month</option>
          {#each [2, 3, 4, 6] as n (n)}<option value={n}>{n} months</option>{/each}
        </select>
      </label>
    {/if}
  </div>

  <div class="grid-2">
    <label class="field"><span>{existing ? 'First payment' : 'Next payment'}</span><input type="date" bind:value={start} required /></label>
    <label class="field"><span>Last payment (optional)</span><input type="date" bind:value={end} min={start} /></label>
  </div>

  <label class="check"><input type="checkbox" bind:checked={auto} /> Add each payment automatically on its day</label>
  {#if auto && account && start < account.openingDate}
    <p class="note small">Payments before {formatDate(account.openingDate)} aren't added: they're already in {account.name}'s starting balance.</p>
  {/if}
  {#if auto && catchUp.length}
    <p class="note small">
      {plural(catchUp.length, 'payment')} from {formatDate(catchUp[0])} will be added now, because {catchUp.length === 1 ? 'it is' : 'they are'} already due.
      If you already entered {catchUp.length === 1 ? 'it' : 'them'}, choose the next payment date instead.
    </p>
  {/if}

  <label class="field"><span>Note</span><input bind:value={note} placeholder="Optional" /></label>

  {#if account && amountText && parseAmount(amountText, currency)}
    <p class="small muted m0">
      {formatMoney(parseAmount(amountText, currency)!, currency)}
      {repeat === 'yearly' ? 'a year' : every > 1 ? `every ${every} months` : 'a month'} from {account.name}.
    </p>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="row">
    <button class="btn primary">Save</button>
    <button type="button" class="btn" onclick={() => router.back('/plan?s=bills')}>Cancel</button>
    {#if existing}<button type="button" class="btn danger" onclick={stop}>Stop</button>{/if}
  </div>
</form>

<style>
  .form {
    max-width: 560px;
  }

  .note {
    margin: -0.4rem 0 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .m0 {
    margin: 0;
  }
</style>
