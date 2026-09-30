<script lang="ts">
  import { committed, matchEstimates, nextBill, toStatement } from '../lib/card';
  import { decodeCsv, parseRakuten, parseRakutenCsv, remainingPayments, type ParsedStatement } from '../lib/import/rakuten';
  import { formatMoney } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Account, Transaction } from '../lib/types';
  import { addMonths, formatDate, formatMonth, nowIso, plural, today } from '../lib/util';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  // Credit card details: next withdrawal, instalment (分割払い) schedule, statements.
  let { card }: { card: Account } = $props();

  const mine = $derived(store.statements.filter((s) => s.accountId === card.id));
  const latest = $derived(mine.at(-1));
  // Statements already read but not withdrawn yet: the exact amount is known.
  const upcoming = $derived(mine.filter((s) => s.payDate >= today()));
  const next = $derived(nextBill(card, store.statements, store.data.transactions, today()));
  const schedule = $derived([...committed(latest)]);
  const maxMonth = $derived(Math.max(1, ...schedule.map(([, v]) => v.total)));
  const owedOnPlans = $derived(latest ? latest.plans.reduce((s, p) => s + p.carry, 0) : 0);
  const activePlans = $derived(
    (latest?.plans ?? [])
      .filter((p) => p.count > p.nth)
      .map((p) => ({ ...p, next: remainingPayments(p.carry, p.count - p.nth)[0], left: p.count - p.nth }))
      .sort((a, b) => b.carry - a.carry),
  );
  // Fee for the month: each plan's fee spread over its payments.
  const monthlyFees = $derived(latest ? Math.round(latest.plans.reduce((s, p) => s + p.fee / p.count, 0)) : 0);
  let showAllPlans = $state(false);
  let showMonth = $state<string | null>(null);

  const shopName = (s: string) => s.normalize('NFKC').replace(/\s*\(ヘンサイヘンコウ\)?$/, '').replace(/\(ヘンサイヘンコウ$/, '').trim();

  // ---- import ------------------------------------------------------------------------
  let fileInput: HTMLInputElement | undefined = $state();
  let reading = $state(false);
  let parsed = $state<ParsedStatement | null>(null);
  let fileName = $state('');
  let fixes = $state<{ tx: Transaction; amount: number }[]>([]);
  let readError = $state('');

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    reading = true;
    readError = '';
    parsed = null;
    try {
      const buffer = await file.arrayBuffer();
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { pdfRows } = await import('../lib/import/pdfText');
        parsed = parseRakuten(await pdfRows(buffer));
      } else if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
        parsed = parseRakutenCsv(decodeCsv(buffer));
      } else {
        throw new Error('Choose the statement PDF (ご利用代金請求明細書) or the ご利用明細 CSV from e-NAVI.');
      }
      fileName = file.name;
      fixes = matchEstimates(parsed, card.id, store.data.transactions);
    } catch (err) {
      readError = err instanceof Error ? err.message : 'Couldn’t read that file.';
    } finally {
      reading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  const preview = $derived(parsed ? toStatement(parsed, card.id, nowIso(), fileName) : null);
  const replacing = $derived(preview ? mine.find((s) => s.billMonth === preview.billMonth) : undefined);

  async function saveImport() {
    if (!preview) return;
    await store.saveStatement(preview, fixes);
    toasts.show(`${formatMonth(preview.billMonth)} statement added.`);
    parsed = null;
  }

  async function removeStatement(id: string) {
    const st = mine.find((s) => s.id === id);
    if (!st || !confirm(`Remove the ${formatMonth(st.billMonth)} statement? A withdrawal it already recorded stays.`)) return;
    await store.deleteStatement(st);
  }
</script>

{#each upcoming as s (s.id)}
  <section class="card stack">
    <div class="row between"><h2>{formatMonth(s.billMonth)} withdrawal</h2><span class="chip tiny">{formatDate(s.payDate)}</span></div>
    <span class="big num">{formatMoney(s.total, 'JPY')}</span>
    <div class="rows small">
      <div class="row between"><span class="muted">1回払い</span><span class="num">{formatMoney(s.once, 'JPY')}</span></div>
      <div class="row between"><span class="muted">分割払い ({plural(s.plans.length, 'plan')})</span><span class="num">{formatMoney(s.instalments, 'JPY')}</span></div>
      {#if s.other}<div class="row between"><span class="muted">Other</span><span class="num">{formatMoney(s.other, 'JPY')}</span></div>{/if}
    </div>
    <p class="xs muted m0">Exact, from {s.fileName ?? 'the 明細'}. Recorded on its day{card.paysFromId ? ` from ${store.account(card.paysFromId)?.name}` : ''}.</p>
  </section>
{/each}

<section class="card stack">
  <div class="row between"><h2>{upcoming.length ? 'After that' : 'Next withdrawal'}</h2><span class="chip tiny">{formatDate(next.payDate)}</span></div>
  <span class="big num">{formatMoney(next.total, 'JPY')}</span>
  <div class="rows small">
    <div class="row between"><span class="muted">Purchases in {formatMonth(addMonths(next.billMonth, -1))}</span><span class="num">{formatMoney(next.once, 'JPY')}</span></div>
    <div class="row between"><span class="muted">分割払い already scheduled</span><span class="num">{formatMoney(next.instalments, 'JPY')}</span></div>
  </div>
  <p class="xs muted m0">
    Estimate: what you entered on {card.name} for that month, plus instalments from the last statement.
    {#if next.partial}Purchases before {formatDate(card.openingDate)} aren't in the app, so this month's estimate is low.{/if}
    {#if !latest}Add a 明細 to include your 分割払い.{/if}
    The real amount comes with the 明細, and the withdrawal is then recorded on its day{card.paysFromId ? ` from ${store.account(card.paysFromId)?.name}` : ''}.
  </p>
</section>

{#if schedule.length}
  <section class="card stack">
    <h2>分割払い already scheduled</h2>
    <p class="xs muted m0">Exact amounts from the {formatMonth(latest!.billMonth)} statement, fees included, before any new 分割.</p>
    <ul class="months">
      {#each schedule as [month, v] (month)}
        <li>
          <button type="button" class="month" onclick={() => (showMonth = showMonth === month ? null : month)} aria-expanded={showMonth === month}>
            <span class="row between small"><span>{formatMonth(month)}</span><span class="num strong">{formatMoney(v.total, 'JPY')}</span></span>
            <span class="track"><span class="fill" style:width="{(v.total / maxMonth) * 100}%"></span></span>
            <span class="xs muted">{plural(v.payments.length, 'plan')}{v.payments.filter((p) => p.nth === p.count).length ? ` · ${v.payments.filter((p) => p.nth === p.count).length} ending` : ''}</span>
          </button>
          {#if showMonth === month}
            <ul class="detail xs">
              {#each v.payments as p, i (i)}
                <li class="row between"><span>{shopName(p.shop)} <span class="muted">{p.nth}/{p.count}</span></span><span class="num">{formatMoney(p.amount, 'JPY')}</span></li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="tiles">
      <div class="tile"><span class="xs muted">Still owed on plans</span><span class="strong num">{formatMoney(owedOnPlans, 'JPY')}</span></div>
      <div class="tile"><span class="xs muted">Instalment fees</span><span class="strong num">≈ {formatMoney(monthlyFees, 'JPY')} a month</span></div>
    </div>
  </section>

  <section class="card stack">
    <h2>Instalment plans ({activePlans.length})</h2>
    <ul class="plans">
      {#each showAllPlans ? activePlans : activePlans.slice(0, 5) as p, i (i)}
        <li class="row between">
          <span class="col">
            <span>{shopName(p.shop)}</span>
            <span class="xs muted">{formatDate(p.date)} · {formatMoney(p.purchase, 'JPY')} in {p.count} · {p.left} left · fee {formatMoney(p.fee, 'JPY')}</span>
          </span>
          <span class="col right"><span class="num">{formatMoney(p.next, 'JPY')}</span><span class="xs muted num">{formatMoney(p.carry, 'JPY')} left</span></span>
        </li>
      {/each}
    </ul>
    {#if activePlans.length > 5}
      <button type="button" class="btn small" onclick={() => (showAllPlans = !showAllPlans)}>{showAllPlans ? 'Show fewer' : `Show all ${activePlans.length}`}</button>
    {/if}
  </section>
{/if}

<section class="card stack">
  <div class="row between">
    <h2>Statements (明細)</h2>
    <button type="button" class="btn small" disabled={reading} onclick={() => fileInput?.click()}><Icon name="upload" size={16} />{reading ? 'Reading…' : 'Add a 明細'}</button>
    <input bind:this={fileInput} type="file" accept="application/pdf,.pdf,text/csv,.csv" hidden onchange={pick} />
  </div>
  {#if readError}<p class="error small" role="alert">{readError}</p>{/if}
  {#if mine.length === 0}
    <p class="small muted m0">In e-NAVI: ご利用明細 → the month → PDF (ご利用代金請求明細書), or CSV for a month that isn't closed yet. Add it here to see your exact 分割払い and have the withdrawal recorded.</p>
  {:else}
    <ul class="plans">
      {#each [...mine].reverse() as s (s.id)}
        <li class="row between">
          <span class="col"><span>{formatMonth(s.billMonth)}</span><span class="xs muted">Withdrawn {formatDate(s.payDate)} · 1回 {formatMoney(s.once, 'JPY')} · 分割 {formatMoney(s.instalments, 'JPY')}</span></span>
          <span class="row"><span class="num">{formatMoney(s.total, 'JPY')}</span><button type="button" class="btn ghost icon" aria-label="Remove {formatMonth(s.billMonth)} statement" onclick={() => removeStatement(s.id)}><Icon name="trash" size={16} /></button></span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<Modal open={!!preview} title={preview ? `${formatMonth(preview.billMonth)} statement` : ''} onclose={() => (parsed = null)}>
  {#if preview}
    <div class="stack">
      <div class="row between"><span class="muted">Withdrawn {formatDate(preview.payDate)}</span><span class="big num">{formatMoney(preview.total, 'JPY')}</span></div>
      <div class="rows small">
        <div class="row between"><span class="muted">One-time (1回払い)</span><span class="num">{formatMoney(preview.once, 'JPY')}</span></div>
        <div class="row between"><span class="muted">Instalments · {plural(preview.plans.length, 'plan')}</span><span class="num">{formatMoney(preview.instalments, 'JPY')}</span></div>
        {#if preview.other}<div class="row between"><span class="muted">Other</span><span class="num">{formatMoney(preview.other, 'JPY')}</span></div>{/if}
      </div>
      {#if fixes.length}
        <p class="small m0">{plural(fixes.length, 'dollar purchase')} will get the real yen amount:
          {fixes.map((f) => `${f.tx.payee ?? 'purchase'} ${formatMoney(f.tx.amount, 'JPY')} → ${formatMoney(f.amount, 'JPY')}`).join(', ')}.</p>
      {/if}
      {#if replacing}<p class="small muted m0">This replaces the {formatMonth(preview.billMonth)} statement added before.</p>{/if}
      {#if card.paysFromId && preview.payDate >= card.openingDate}
        <p class="small muted m0">The withdrawal is recorded on {formatDate(preview.payDate)} from {store.account(card.paysFromId)?.name}.</p>
      {:else if preview.payDate < card.openingDate}
        <p class="small muted m0">Withdrawn before {card.name}'s starting date, so it isn't recorded again; the instalments still count.</p>
      {/if}
      {#if /\.csv$/i.test(fileName) && preview.payDate > today()}<p class="small muted m0">The bill can still change until e-NAVI closes the month. Adding the PDF later replaces this.</p>{/if}
      <p class="xs muted m0">Only the totals and the 分割 plans are kept, not every purchase, and not the file.</p>
    </div>
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (parsed = null)}>Cancel</button>
    <button type="button" class="btn primary" onclick={saveImport}>Add statement</button>
  {/snippet}
</Modal>

<style>
  h2 {
    margin: 0;
  }

  .m0 {
    margin: 0;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .months,
  .plans,
  .detail {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .month {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .month .fill {
    background: var(--series-1);
  }

  .detail {
    gap: 3px;
    margin: 6px 0 2px 10px;
    padding-left: 10px;
    border-left: 2px solid var(--border);
  }

  .plans li {
    flex-wrap: nowrap;
    align-items: flex-start;
  }

  .plans li + li {
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .right {
    align-items: flex-end;
  }

  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
  }
</style>
