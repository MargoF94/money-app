<script lang="ts" module>
  export interface PieSlice {
    label: string;
    value: number;
    color: string; // CSS color, e.g. var(--series-1)
  }
</script>

<script lang="ts">
  // Donut for part-to-whole. Slices keep the order given (so neighbours are the
  // validated color pairs); every slice is labelled in the legend with its count
  // and share, hover/focus shows it in the centre, and a table view lists all.
  let {
    title,
    slices,
    caption = '',
    unit = 'items',
    format = (n: number) => n.toLocaleString('en-US'),
    compact = format,
  }: {
    title: string;
    slices: PieSlice[];
    caption?: string;
    unit?: string;
    /** Values in the legend and table. */
    format?: (n: number) => string;
    /** The total in the middle of the donut, which has little room. */
    compact?: (n: number) => string;
  } = $props();

  const SIZE = 168;
  const R = 78;
  const INNER = 50;
  const C = SIZE / 2;

  let hovered = $state<number | null>(null);

  const total = $derived(slices.reduce((s, x) => s + x.value, 0));
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  // Arc paths; a 2px surface stroke separates slices.
  const arcs = $derived.by(() => {
    let a0 = -Math.PI / 2;
    return slices.map((s, i) => {
      const frac = total ? s.value / total : 0;
      const a1 = a0 + frac * Math.PI * 2;
      const d = frac >= 0.9999 ? ring() : wedge(a0, a1);
      const mid = (a0 + a1) / 2;
      a0 = a1;
      return { i, d, frac, mid };
    });
  });

  const pt = (r: number, a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
  function wedge(a0: number, a1: number): string {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(INNER, a1)}A${INNER},${INNER} 0 ${large} 0 ${pt(INNER, a0)}Z`;
  }
  function ring(): string {
    return `M${C - R},${C}a${R},${R} 0 1 0 ${2 * R},0a${R},${R} 0 1 0 ${-2 * R},0ZM${C - INNER},${C}a${INNER},${INNER} 0 1 1 ${2 * INNER},0a${INNER},${INNER} 0 1 1 ${-2 * INNER},0Z`;
  }

  const summary = $derived(slices.filter((s) => s.value).map((s) => `${s.label} ${s.value} (${pct(s.value)}%)`).join(', '));
</script>

<figure class="chart">
  <figcaption>
    <strong>{title}</strong>
    {#if caption}<p class="small muted">{caption}</p>{/if}
  </figcaption>

  {#if total === 0}
    <p class="none small muted">Nothing in this period.</p>
  {:else}
    <div class="body">
      <div class="donut">
        <svg width={SIZE} height={SIZE} viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label="{title}: {summary}">
          {#each arcs as a (a.i)}
            {#if a.frac > 0}
              <path
                d={a.d}
                fill={slices[a.i].color}
                fill-rule="evenodd"
                class:dim={hovered !== null && hovered !== a.i}
                role="presentation"
                onpointerenter={() => (hovered = a.i)}
                onpointerleave={() => (hovered = null)}
              />
            {/if}
          {/each}
        </svg>
        <div class="centre" aria-hidden="true">
          {#if hovered !== null}
            <strong>{pct(slices[hovered].value)}%</strong>
            <span>{slices[hovered].label}</span>
          {:else}
            <strong>{compact(total)}</strong>
            <span>{unit}</span>
          {/if}
        </div>
      </div>

      <ul class="legend">
        {#each slices as s, i (s.label)}
          <li>
            <button
              type="button"
              class:dim={hovered !== null && hovered !== i}
              onpointerenter={() => (hovered = i)}
              onpointerleave={() => (hovered = null)}
              onfocus={() => (hovered = i)}
              onblur={() => (hovered = null)}
            >
              <i style:background={s.color}></i>
              <span class="name">{s.label}</span>
              <span class="val">{format(s.value)} · {pct(s.value)}%</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>

    <details class="table-view">
      <summary class="small">Show table</summary>
      <table class="small">
        <thead><tr><th scope="col"></th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
        <tbody>
          {#each slices as s (s.label)}
            <tr><th scope="row">{s.label}</th><td>{format(s.value)}</td><td>{pct(s.value)}%</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</figure>

<style>
  .chart {
    margin: 0;
  }

  figcaption p {
    margin: 0.1rem 0 0;
  }

  .none {
    margin: 1rem 0;
  }

  .body {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }

  .donut {
    position: relative;
    flex-shrink: 0;
  }

  svg {
    display: block;
  }

  path {
    stroke: var(--surface);
    stroke-width: 2;
    stroke-linejoin: round;
    transition: opacity 0.12s;
  }

  .dim {
    opacity: 0.4;
  }

  .centre {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    pointer-events: none;
    padding: 0 3.6rem;
  }

  .centre strong {
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .centre span {
    font-size: 0.72rem;
    color: var(--text-2);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1 1 150px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .legend button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    padding: 0.2rem 0.1rem;
    text-align: left;
    cursor: default;
    border-radius: 4px;
    transition: opacity 0.12s;
  }

  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .val {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .table-view {
    margin-top: 0.6rem;
  }

  .table-view summary {
    cursor: pointer;
    color: var(--text-2);
  }

  table {
    border-collapse: collapse;
    margin-top: 0.4rem;
  }

  th,
  td {
    padding: 0.15rem 0.8rem 0.15rem 0;
    text-align: left;
    font-weight: normal;
  }

  td {
    font-variant-numeric: tabular-nums;
  }
</style>
