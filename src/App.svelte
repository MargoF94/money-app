<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './components/Icon.svelte';
  import SyncBadge from './components/SyncBadge.svelte';
  import { router } from './lib/router.svelte';
  import { store } from './lib/store.svelte';
  import { sync } from './lib/sync.svelte';
  import { toasts } from './lib/toast.svelte';
  import AccountForm from './pages/AccountForm.svelte';
  import AccountPage from './pages/AccountPage.svelte';
  import Accounts from './pages/Accounts.svelte';
  import Activity from './pages/Activity.svelte';
  import BillForm from './pages/BillForm.svelte';
  import Plan from './pages/Plan.svelte';
  import Home from './pages/Home.svelte';
  import Settings from './pages/Settings.svelte';
  import Stats from './pages/Stats.svelte';
  import TxForm from './pages/TxForm.svelte';

  let loadError = $state('');

  onMount(async () => {
    try {
      await store.load();
      await store.addDuePayments();
      await sync.init();
      // The app may stay open for days on a phone: check again whenever it comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void store.addDuePayments();
      });
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  });

  // Theme: "system" follows the device; otherwise force light/dark.
  $effect(() => {
    const theme = store.settings.theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  const NAV = [
    { href: '#/', icon: 'home', label: 'Home', match: (s: string[]) => s.length === 0 },
    { href: '#/activity', icon: 'list', label: 'Activity', match: (s: string[]) => s[0] === 'activity' || s[0] === 'tx' },
    { href: '#/add', icon: 'plus', label: 'Add', match: (s: string[]) => s[0] === 'add' },
    { href: '#/accounts', icon: 'wallet', label: 'Accounts', match: (s: string[]) => s[0] === 'accounts' || s[0] === 'account' },
    { href: '#/plan', icon: 'calendar', label: 'Plan', match: (s: string[]) => s[0] === 'plan' || s[0] === 'bill' },
    { href: '#/stats', icon: 'chart', label: 'Stats', match: (s: string[]) => s[0] === 'stats' },
  ];
  // Phones show Settings as a gear in the top bar; the sidebar lists it.
  const SETTINGS = { href: '#/settings', icon: 'settings', label: 'Settings', match: (s: string[]) => s[0] === 'settings' };
  const SIDE_NAV = [...NAV, SETTINGS];

  const seg = $derived(router.route.segments);
</script>

<div class="shell">
  <nav class="side" aria-label="Main">
    <a class="brand" href="#/"><Icon name="yen" size={22} /> Money Log</a>
    {#each SIDE_NAV as n (n.href)}
      <a href={n.href} class:active={n.match(seg)} aria-current={n.match(seg) ? 'page' : undefined}>
        <Icon name={n.icon} />
        {n.label}
      </a>
    {/each}
    <div class="side-sync"><SyncBadge /></div>
  </nav>

  <main>
    <div class="topbar">
      <SyncBadge />
      <a
        class="gear"
        href="#/settings"
        class:active={SETTINGS.match(seg)}
        aria-label="Settings"
        aria-current={SETTINGS.match(seg) ? 'page' : undefined}><Icon name="settings" size={22} /></a
      >
    </div>
    {#if loadError}
      <div class="card">
        <h1>Couldn't open your data</h1>
        <p>{loadError}</p>
        <p class="muted small">Private browsing modes sometimes block storage. Try a normal window.</p>
      </div>
    {:else if !store.loaded}
      <p class="muted">Loading…</p>
    {:else if seg.length === 0}
      <Home />
    {:else if seg[0] === 'activity'}
      <Activity />
    {:else if seg[0] === 'add'}
      {#key router.route.query.toString()}<TxForm />{/key}
    {:else if seg[0] === 'tx' && seg[1]}
      {#key seg[1]}<TxForm id={seg[1]} />{/key}
    {:else if seg[0] === 'accounts'}
      <Accounts />
    {:else if seg[0] === 'account' && seg[1] === 'new'}
      <AccountForm />
    {:else if seg[0] === 'account' && seg[1] && seg[2] === 'edit'}
      {#key seg[1]}<AccountForm id={seg[1]} />{/key}
    {:else if seg[0] === 'account' && seg[1]}
      {#key seg[1]}<AccountPage id={seg[1]} />{/key}
    {:else if seg[0] === 'plan'}
      <Plan />
    {:else if seg[0] === 'bill' && seg[1] === 'new'}
      <BillForm />
    {:else if seg[0] === 'bill' && seg[1]}
      {#key seg[1]}<BillForm id={seg[1]} />{/key}
    {:else if seg[0] === 'stats'}
      <Stats />
    {:else if seg[0] === 'settings'}
      <Settings />
    {:else}
      <div class="card empty"><h1>Not found</h1><a href="#/">Go home</a></div>
    {/if}
  </main>

  <nav class="tabs" aria-label="Main">
    {#each NAV as n (n.href)}
      <a href={n.href} class:active={n.match(seg)} aria-current={n.match(seg) ? 'page' : undefined}>
        <Icon name={n.icon} size={22} />
        <span>{n.label}</span>
      </a>
    {/each}
  </nav>
</div>

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .shell {
    min-height: 100dvh;
  }

  main {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0.5rem 1rem calc(var(--nav-h) + 1.5rem + env(safe-area-inset-bottom));
  }

  .topbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.4rem;
    min-height: 32px;
  }

  .gear {
    display: inline-flex;
    padding: 0.3rem;
    border-radius: var(--radius-sm);
    color: var(--text-2);
  }

  .gear.active {
    color: var(--accent);
  }

  .side {
    display: none;
  }

  .tabs {
    position: fixed;
    z-index: 20;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tabs a {
    flex: 1;
    height: var(--nav-h);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.72rem;
    color: var(--text-2);
    text-decoration: none;
  }

  .tabs a.active {
    color: var(--accent);
    font-weight: 600;
  }

  @media (min-width: 900px) {
    .shell {
      display: grid;
      grid-template-columns: 220px 1fr;
    }

    .tabs,
    .topbar {
      display: none;
    }

    main {
      width: 100%;
      padding: 2rem 2rem 3rem;
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      position: sticky;
      top: 0;
      height: 100dvh;
      padding: 1.25rem 0.75rem;
      border-right: 1px solid var(--border);
      background: var(--surface);
    }

    .side a {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-sm);
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
    }

    .side a:hover {
      background: var(--surface-2);
    }

    .side a.active {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .side .brand {
      font-family: var(--font-serif);
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 1rem;
    }

    .side .brand:hover {
      background: none;
    }

    .side-sync {
      margin-top: auto;
    }
  }

  .toasts {
    position: fixed;
    z-index: 100;
    left: 50%;
    translate: -50% 0;
    bottom: calc(var(--nav-h) + 1rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(420px, calc(100% - 2rem));
    pointer-events: none;
  }

  .toast {
    background: var(--text);
    color: var(--bg);
    padding: 0.7rem 1rem;
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    font-size: 0.9rem;
  }

  .toast.error {
    background: var(--danger);
    color: #fff;
  }

  @media (min-width: 900px) {
    .toasts {
      bottom: 1.5rem;
    }
  }
</style>
