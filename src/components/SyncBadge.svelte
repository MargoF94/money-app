<script lang="ts">
  import { sync } from '../lib/sync.svelte';
  import Icon from './Icon.svelte';

  const label = $derived.by(() => {
    switch (sync.state) {
      case 'off':
        return 'Sync off';
      case 'syncing':
        return 'Syncing…';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Sync error';
      default:
        return sync.pending ? 'Changes waiting' : 'Synced';
    }
  });
  const icon = $derived(
    sync.state === 'error' ? 'alert' : sync.state === 'offline' || sync.state === 'off' ? 'cloudOff' : sync.pending ? 'sync' : 'check',
  );
</script>

<a
  href="#/settings"
  class="sync sync-{sync.state}"
  title={sync.error ?? label}
  onclick={() => {
    if (sync.state === 'error' || sync.state === 'idle') void sync.run();
  }}
>
  <span class:spin={sync.state === 'syncing'}><Icon name={sync.state === 'syncing' ? 'sync' : icon} size={16} /></span>
  <span class="text">{label}</span>
</a>

<style>
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    font-size: 0.8rem;
    color: var(--text-2);
    text-decoration: none;
    padding: 0.3em 0.6em;
    border-radius: 999px;
  }

  .sync:hover {
    background: var(--surface-2);
  }

  .sync-error {
    color: var(--danger);
  }

  .sync-idle {
    color: var(--ok);
  }

  span {
    display: inline-flex;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
