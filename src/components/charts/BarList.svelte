<script lang="ts">
  // Horizontal bars for named categories (genres, authors…): one colour, value at
  // the bar's tip, so every number is readable without hovering.
  let {
    title,
    rows,
    color = 'var(--series-1)',
    format = (n: number) => n.toLocaleString('en-US'),
    href = undefined,
  }: {
    title: string;
    rows: { name: string; count: number }[];
    color?: string;
    format?: (n: number) => string;
    href?: (name: string) => string | undefined;
  } = $props();

  const max = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

<figure class="bars">
  <figcaption><h3>{title}</h3></figcaption>
  {#if rows.length === 0}
    <p class="small muted none">Nothing in this period.</p>
  {:else}
    <ul>
      {#each rows as r (r.name)}
        {@const link = href?.(r.name)}
        <li>
          {#if link}<a class="name" href={link} title={r.name}>{r.name}</a>{:else}<span class="name" title={r.name}>{r.name}</span>{/if}
          <span class="lane">
            <span class="bar" style:width="calc((100% - 5rem) * {r.count / max})" style:background={color}></span>
            <span class="value">{format(r.count)}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</figure>

<style>
  .bars {
    margin: 0;
    min-width: 0;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 9.5rem) minmax(0, 1fr);
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    text-decoration: none;
  }

  a.name:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  .lane {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .bar {
    height: 12px;
    min-width: 2px;
    border-radius: 0 4px 4px 0;
    flex: 0 0 auto;
  }

  .value {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    font-size: 0.8rem;
  }

  .none {
    margin: 0;
  }
</style>
