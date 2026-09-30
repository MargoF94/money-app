<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { CATEGORY_ICONS } from '../lib/constants';
  import { checkRepo } from '../lib/github';
  import { downloadCsv, transactionsCsv } from '../lib/csv';
  import { parseFile, toBackup } from '../lib/merge';
  import { store } from '../lib/store.svelte';
  import { sync } from '../lib/sync.svelte';
  import { toasts } from '../lib/toast.svelte';
  import type { Category, CategoryKind, Theme } from '../lib/types';
  import { newId, nowIso, plural, today } from '../lib/util';

  // Guess the GitHub user from the Pages address (<user>.github.io).
  const guessedOwner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '';

  let owner = $state(sync.config?.owner ?? guessedOwner);
  let repo = $state(sync.config?.repo ?? 'money-data');
  let token = $state('');
  let connecting = $state(false);
  let connectError = $state('');

  async function connect(e: Event) {
    e.preventDefault();
    connectError = '';
    const cfg = { owner: owner.trim(), repo: repo.trim(), token: token.trim() };
    if (!cfg.owner || !cfg.repo || !cfg.token) return void (connectError = 'Fill in all three fields.');
    connecting = true;
    try {
      const info = await checkRepo(cfg);
      if (!info.private && !confirm(`${info.fullName} is PUBLIC: anyone could read your money data. Connect anyway? (Make the repo private first.)`)) return;
      await sync.configure(cfg);
      token = '';
      if (sync.state === 'error') connectError = sync.error ?? '';
      else toasts.show('Sync connected.');
    } catch (err) {
      connectError = err instanceof Error ? err.message : String(err);
    } finally {
      connecting = false;
    }
  }

  async function disconnect() {
    if (!confirm('Stop syncing on this device? Your data stays here and in the data repo.')) return;
    await sync.configure(null);
  }

  const lastSynced = $derived(sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'never');

  function download() {
    const url = URL.createObjectURL(new Blob([toBackup(store.data, nowIso())], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `money-log-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let fileInput: HTMLInputElement | undefined = $state();
  async function restore(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const n = await store.applyRemote(parseFile(await file.text()));
      toasts.show(n ? `Imported ${plural(n, 'change')}.` : 'Nothing new in that file.');
      if (n) void sync.run();
    } catch (err) {
      toasts.show(err instanceof Error ? err.message : 'Could not read that file.', 'error');
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  // ---- categories ---------------------------------------------------------------
  let catKind = $state<CategoryKind>('expense');
  let newName = $state('');
  const cats = $derived(store.categories.filter((c) => c.kind === catKind));

  async function update(c: Category, patch: Partial<Category>) {
    await store.saveCategory({ ...c, ...patch });
  }

  async function move(c: Category, dir: -1 | 1) {
    const list = cats;
    const i = list.indexOf(c);
    const other = list[i + dir];
    if (!other) return;
    await store.put('categories', list.map((x, j) => ({ ...x, order: j === i ? i + dir : j === i + dir ? i : j })));
  }

  async function addCategory(e: Event) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const now = nowIso();
    await store.saveCategory({ id: newId(), createdAt: now, updatedAt: now, name, kind: catKind, icon: 'grid', order: cats.length });
    newName = '';
  }
</script>

<h1>Settings</h1>

<div class="stack page">
  <section class="card stack">
    <h2>Sync</h2>
    {#if sync.config}
      <p class="m0">Connected to <strong>{sync.config.owner}/{sync.config.repo}</strong>.<br /><span class="small muted">Last synced: {lastSynced}</span></p>
      {#if sync.error}<p class="error" role="alert">{sync.error}</p>{/if}
      <div class="row">
        <button type="button" class="btn primary" disabled={sync.state === 'syncing'} onclick={() => sync.run()}>{sync.state === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
        <button type="button" class="btn" onclick={disconnect}>Disconnect</button>
      </div>
      <details>
        <summary class="small">Replace the token</summary>
        <form class="stack" style="margin-top:0.75rem" onsubmit={connect}>
          <label class="field"><span>New token</span><input type="password" bind:value={token} autocomplete="off" /></label>
          {#if connectError}<p class="error" role="alert">{connectError}</p>{/if}
          <div><button class="btn" disabled={connecting}>Save token</button></div>
        </form>
      </details>
    {:else}
      <p class="m0 small">Save your data to your private <code>money-data</code> repo so your phone and computer share it. Without sync, it lives only in this browser.</p>
      <form class="stack" onsubmit={connect}>
        <div class="grid-2">
          <label class="field"><span>GitHub username</span><input bind:value={owner} autocapitalize="off" /></label>
          <label class="field"><span>Data repo</span><input bind:value={repo} autocapitalize="off" /></label>
        </div>
        <label class="field"><span>Access token</span><input type="password" bind:value={token} autocomplete="off" placeholder="github_pat_…" /></label>
        {#if connectError}<p class="error" role="alert">{connectError}</p>{/if}
        <div><button class="btn primary" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect'}</button></div>
      </form>
      <details>
        <summary class="small">How to create the token</summary>
        <ol class="small help">
          <li>On GitHub: profile picture → <strong>Settings</strong> → <strong>Developer settings</strong> → <strong>Personal access tokens</strong> → <strong>Fine-grained tokens</strong> → <strong>Generate new token</strong>.</li>
          <li>Expiration: pick the longest you're comfortable with (you'll paste a new one when it runs out).</li>
          <li>Repository access: <strong>Only select repositories</strong> → <code>money-data</code>.</li>
          <li>Permissions → Repository permissions → <strong>Contents: Read and write</strong>.</li>
          <li>Generate, copy, and paste it above. It is stored only on this device.</li>
        </ol>
      </details>
    {/if}
  </section>

  <section class="card stack">
    <h2>Preferences</h2>
    <div class="grid-2">
      <label class="field">
        <span>Theme</span>
        <select value={store.settings.theme} onchange={(e) => store.saveSettings({ theme: e.currentTarget.value as Theme })}>
          <option value="system">Match device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label class="field">
        <span>Account chosen first when adding</span>
        <select value={store.settings.defaultAccountId ?? ''} onchange={(e) => store.saveSettings({ defaultAccountId: e.currentTarget.value || undefined })}>
          <option value="">The last one used</option>
          {#each store.openAccounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
        </select>
      </label>
    </div>
  </section>

  <section class="card stack">
    <h2>Categories</h2>
    <div class="seg" role="group" aria-label="Kind">
      <button type="button" class:on={catKind === 'expense'} onclick={() => (catKind = 'expense')}>Spending</button>
      <button type="button" class:on={catKind === 'income'} onclick={() => (catKind = 'income')}>Income</button>
    </div>
    <ul class="cats">
      {#each cats as c, i (c.id)}
        <li class:hidden={c.hidden}>
          <select class="icon-pick" value={c.icon} onchange={(e) => update(c, { icon: e.currentTarget.value })} aria-label="Icon for {c.name}">
            {#each CATEGORY_ICONS as ic (ic)}<option value={ic}>{ic}</option>{/each}
          </select>
          <span class="ic"><Icon name={c.icon} size={18} /></span>
          <input value={c.name} aria-label="Name" onchange={(e) => e.currentTarget.value.trim() && update(c, { name: e.currentTarget.value.trim() })} />
          <button type="button" class="btn ghost icon" aria-label="Move {c.name} up" disabled={i === 0} onclick={() => move(c, -1)}><Icon name="up" size={18} /></button>
          <button type="button" class="btn ghost icon" aria-label="Move {c.name} down" disabled={i === cats.length - 1} onclick={() => move(c, 1)}><Icon name="chevron" size={18} /></button>
          <label class="check small"><input type="checkbox" checked={!c.hidden} onchange={(e) => update(c, { hidden: !e.currentTarget.checked || undefined })} />Show</label>
        </li>
      {/each}
    </ul>
    <form class="row" onsubmit={addCategory}>
      <input bind:value={newName} placeholder="New category" aria-label="New category" style="flex:1;width:auto" />
      <button class="btn">Add</button>
    </form>
  </section>

  <section class="card stack">
    <h2>Backup</h2>
    <p class="small muted m0">
      {plural(store.transactions.length, 'transaction')} in {plural(store.accounts.length, 'account')}. A backup file can be
      loaded on any device; it is merged with what's already there.
    </p>
    <div class="row">
      <button type="button" class="btn" onclick={download}><Icon name="download" size={18} />Download backup</button>
      <button type="button" class="btn" onclick={() => fileInput?.click()}><Icon name="upload" size={18} />Load a backup…</button>
      <button type="button" class="btn" onclick={() => downloadCsv(transactionsCsv([...store.transactions].reverse(), store), `money-log-transactions-${today()}.csv`)}>
        <Icon name="download" size={18} />All transactions (CSV)
      </button>
      <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={restore} />
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 760px;
  }

  h2 {
    margin: 0;
  }

  .m0 {
    margin: 0;
  }

  summary {
    cursor: pointer;
    color: var(--accent);
  }

  .help {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  code {
    background: var(--surface-2);
    padding: 0 0.3em;
    border-radius: 3px;
  }

  .cats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cats li {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }

  .cats li.hidden input:not([type]) {
    color: var(--text-2);
  }

  .cats input:not([type]) {
    flex: 1;
    width: auto;
  }

  /* The icon is shown; an invisible select on top of it picks another. */
  .ic {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    pointer-events: none;
  }

  .icon-pick {
    position: absolute;
    left: 0;
    width: 36px;
    height: 36px;
    min-height: 0;
    opacity: 0;
    padding: 0;
    cursor: pointer;
  }

  .cats .check {
    white-space: nowrap;
  }
</style>
