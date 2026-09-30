<script lang="ts">
  import Icon from './Icon.svelte';
  import { monthlyCost, nextDue, repeatLabel } from '../lib/bills';
  import { formatMoney } from '../lib/money';
  import { store } from '../lib/store.svelte';
  import { nextBill } from '../lib/card';
  import { billRule, downloadIcs, toIcs, type CalEvent } from '../lib/ics';
  import { formatDate, today } from '../lib/util';

  // Everything that leaves an account on a date: bills (repeating) and each card's next withdrawal.
  function sendToCalendar() {
    const events: CalEvent[] = store.bills.map((b) => ({
      uid: `bill-${b.id}`,
      date: b.start,
      title: `${b.name}: ${formatMoney(b.amount, store.account(b.accountId)?.currency ?? 'JPY')}`,
      note: `Paid with ${store.account(b.accountId)?.name ?? '?'} (Money Log)`,
      rrule: billRule(b),
    }));
    for (const card of store.openAccounts.filter((a) => a.type === 'card')) {
      const next = nextBill(card, store.statements, store.data.transactions, today());
      events.push({
        uid: `card-${card.id}-${next.billMonth}`,
        date: next.payDate,
        title: `${card.name} withdrawal: about ${formatMoney(next.total, 'JPY')}`,
        note: `From ${store.account(card.paysFromId)?.name ?? 'your bank'}. Check the amount in Money Log.`,
      });
    }
    downloadIcs(toIcs(events), 'money-log-bills.ics');
  }

  const now = today();
  const rows = $derived(
    store.bills
      .map((b) => ({ b, next: nextDue(b, now), account: store.account(b.accountId) }))
      .sort((x, y) => (x.next ?? '9999').localeCompare(y.next ?? '9999')),
  );
  // Totals in yen (dollar accounts are listed but not added up).
  const yen = $derived(rows.filter((r) => r.account?.currency !== 'USD' && r.next));
  const perMonth = $derived(Math.round(yen.reduce((s, r) => s + monthlyCost(r.b), 0)));
</script>

<div class="sec-head"><h2>Subscriptions &amp; bills</h2><a class="btn small" href="#/bill/new"><Icon name="plus" size={16} />Add</a></div>

{#if rows.length === 0}
  <div class="card empty">
    <p>Add Netflix, iCloud+, your phone, rent, Paidy… Each payment is added on its day by itself, to the account or card it's paid with.</p>
    <a class="btn primary" href="#/bill/new">Add a subscription or bill</a>
  </div>
{:else}
  <section class="card totals">
    <div><span class="muted small">A month</span><span class="big num">{formatMoney(perMonth, 'JPY')}</span></div>
    <div><span class="muted small">A year</span><span class="big num">{formatMoney(perMonth * 12, 'JPY')}</span></div>
  </section>

  <div class="card flush">
    {#each rows as { b, next, account } (b.id)}
      <a class="bill" href="#/bill/{b.id}">
        <span class="date-block">
          {#if next}<span class="d">{+next.slice(8, 10)}</span><span class="w">{formatDate(next).slice(0, 3)}</span>
          {:else}<span class="w">ended</span>{/if}
        </span>
        <span class="grow col">
          <span class="name">{b.name}</span>
          <span class="xs muted">{repeatLabel(b)} · {account?.name ?? '?'}{b.auto ? '' : ' · reminder only'}</span>
          {#if next}<span class="xs muted">Next: {formatDate(next)}{b.end ? ` · last ${formatDate(b.end)}` : ''}</span>{/if}
        </span>
        <span class="amt">{formatMoney(b.amount, account?.currency ?? 'JPY')}</span>
      </a>
    {/each}
  </div>
  <p class="xs muted">Payments are added on their day to the account or card they're paid with. Tap one to change or stop it.</p>
  <button type="button" class="btn" onclick={sendToCalendar}><Icon name="calendarPlus" size={18} />Send to iPhone Calendar</button>
  <p class="xs muted">Adds each bill (repeating) and your next card withdrawal to your phone's calendar, with an alert at 9:00 the day before. Those alerts work even when this app is closed. Send again after adding bills; events you already have are updated, not doubled.</p>
{/if}

<style>
  .sec-head {
    margin-bottom: 0.75rem;
  }

  .totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .totals div {
    display: flex;
    flex-direction: column;
  }

  .bill {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    color: var(--text);
    text-decoration: none;
  }

  .bill + .bill {
    border-top: 1px solid var(--border);
  }

  .col {
    display: flex;
    flex-direction: column;
  }

  .name {
    font-weight: 500;
  }

  .date-block {
    width: 44px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
    padding: 5px 0;
    border-radius: 8px;
    background: var(--surface-2);
  }

  .d {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .w {
    font-size: 0.7rem;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
