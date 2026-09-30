// Keeps this device and the private data repo in step. One request lists the
// repo's files with their fingerprints (git blob shas); only files that changed
// since the last sync are downloaded and merged (newest updatedAt wins per
// record), and only files whose content differs are uploaded. If another device
// saves a file first (409), the whole round starts again.
import { getMeta, setMeta } from './db';
import { GitHubError, getBlobText, listFiles, putText, type SyncConfig } from './github';
import { MAIN_PATH, gitBlobSha, isDataPath, parseFile, serialize, toFiles } from './merge';
import { store } from './store.svelte';
import { APP_ID, SCHEMA } from './types';
import { debounce, nowIso } from './util';

export type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

const CONFIG_KEY = 'sync-config';
const LAST_KEY = 'sync-last';
const SHAS_KEY = 'sync-shas';

/** Files that must be written: every local file whose content differs from the repo's. */
export async function changedFiles(local: Map<string, string>, remote: Map<string, string>): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const [path, text] of local) {
    if (remote.get(path) !== (await gitBlobSha(text))) out.push([path, text]);
  }
  return out;
}

/** Local files, plus an empty version of any month file in the repo that no longer has transactions here. */
export function filesToWrite(local: Map<string, string>, remote: Map<string, string>): Map<string, string> {
  const out = new Map(local);
  for (const path of remote.keys()) {
    const month = path.match(/^transactions\/(\d{4}-\d{2})\.json$/)?.[1];
    if (month && !out.has(path)) out.set(path, serialize({ app: APP_ID, schema: SCHEMA, month }, { transactions: [] }));
  }
  return out;
}

class Sync {
  config = $state<SyncConfig | null>(null);
  state = $state<SyncState>('off');
  error = $state<string | null>(null);
  lastSyncedAt = $state<string | null>(null);
  pending = $state(false);

  #changeCounter = 0;
  #running: Promise<void> | null = null;
  #again = false;

  async init(): Promise<void> {
    this.config = (await getMeta<SyncConfig>(CONFIG_KEY)) ?? null;
    this.lastSyncedAt = (await getMeta<string>(LAST_KEY)) ?? null;
    this.state = this.config ? 'idle' : 'off';

    store.onChange(() => {
      this.#changeCounter++;
      this.pending = true;
      this.#schedule();
    });
    window.addEventListener('online', () => this.run());
    window.addEventListener('offline', () => {
      if (this.config) this.state = 'offline';
    });
    document.addEventListener('visibilitychange', () => {
      // Coming back: fetch changes from other devices. Leaving: save now, in case the app is closed.
      if (document.visibilityState === 'visible' || this.pending) void this.run();
    });
    if (this.config) void this.run();
  }

  #schedule = debounce(() => void this.run(), 3000);

  async configure(cfg: SyncConfig | null): Promise<void> {
    this.config = cfg;
    await setMeta(CONFIG_KEY, cfg ? $state.snapshot(cfg) : null);
    await setMeta(SHAS_KEY, {}); // a new repo: download everything once
    this.error = null;
    this.state = cfg ? 'idle' : 'off';
    if (cfg) await this.run();
  }

  /** Runs a sync now (queues one more if a sync is already running). */
  run(): Promise<void> {
    if (!this.config) return Promise.resolve();
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#sync().finally(() => {
      this.#running = null;
      if (this.#again) {
        this.#again = false;
        void this.run();
      }
    });
    return this.#running;
  }

  async #sync(): Promise<void> {
    const cfg = this.config;
    if (!cfg) return;
    if (!navigator.onLine) {
      this.state = 'offline';
      return;
    }
    const startCounter = this.#changeCounter;
    this.state = 'syncing';
    try {
      const known = (await getMeta<Record<string, string>>(SHAS_KEY)) ?? {};
      for (let attempt = 0; ; attempt++) {
        const remote = await listFiles(cfg);
        // 1. Bring in files changed on other devices. money.json first, so accounts exist before their transactions.
        const incoming = [...remote].filter(([path, sha]) => isDataPath(path) && known[path] !== sha);
        incoming.sort(([a], [b]) => (a === MAIN_PATH ? -1 : b === MAIN_PATH ? 1 : a.localeCompare(b)));
        for (const [path, sha] of incoming) {
          await store.applyRemote(parseFile(await getBlobText(cfg, sha)));
          known[path] = sha;
        }
        await setMeta(SHAS_KEY, known);
        // 2. Send what differs.
        const writes = await changedFiles(filesToWrite(toFiles(store.data), remote), remote);
        try {
          for (const [path, text] of writes) {
            const message = path === MAIN_PATH ? 'Update accounts and settings' : `Update ${path.slice(13, 20)}`;
            known[path] = await putText(cfg, path, text, remote.get(path), message);
            await setMeta(SHAS_KEY, known);
          }
          break;
        } catch (e) {
          if (e instanceof GitHubError && e.status === 409 && attempt < 3) continue;
          throw e;
        }
      }
      this.lastSyncedAt = nowIso();
      await setMeta(LAST_KEY, this.lastSyncedAt);
      this.error = null;
      this.state = 'idle';
      if (this.#changeCounter === startCounter) this.pending = false;
      else this.#again = true;
    } catch (e) {
      this.state = navigator.onLine ? 'error' : 'offline';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}

export const sync = new Sync();
