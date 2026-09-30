<script lang="ts" module>
  export interface ColumnSeries {
    name: string;
    color: string; // CSS color, e.g. var(--series-1)
    values: number[];
  }

  /** 0, step, 2·step… covering max with 3–5 ticks at clean numbers. */
  export function niceTicks(max: number): number[] {
    if (max <= 0) return [0, 1];
    const raw = max / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
    const ticks = [];
    for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return ticks;
  }
</script>

<script lang="ts">
  // Thin columns, stacked when there are two series. Hover/focus shows every
  // series at that position; the table view below carries all values too.
  let {
    title,
    labels,
    series,
    format = (n: number) => Math.round(n).toLocaleString('en-US'),
    height = 180,
    caption = '',
    grouped = false,
  }: {
    title: string;
    labels: string[];
    series: ColumnSeries[];
    format?: (n: number) => string;
    height?: number;
    caption?: string;
    /** Side by side (e.g. income and spending) instead of stacked. */
    grouped?: boolean;
  } = $props();

  let width = $state(320);
  let hovered = $state<number | null>(null);

  const M = { top: 12, right: 8, bottom: 24, left: 44 };
  const n = $derived(labels.length);
  const totals = $derived(labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0)));
  const tallest = $derived(labels.map((_, i) => (grouped ? Math.max(0, ...series.map((x) => x.values[i] ?? 0)) : totals[i])));
  const ticks = $derived(niceTicks(Math.max(0, ...tallest)));
  const yMax = $derived(ticks.at(-1) ?? 1);
  const plotW = $derived(Math.max(10, width - M.left - M.right));
  const plotH = $derived(height - M.top - M.bottom);
  const band = $derived(plotW / Math.max(1, n));
  const barW = $derived(
    grouped ? Math.max(3, Math.min(12, (band * 0.72 - 2 * (series.length - 1)) / series.length)) : Math.max(3, Math.min(24, band * 0.62)),
  );
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const labelEvery = $derived(Math.max(1, Math.ceil((n * 38) / plotW)));
  const empty = $derived(tallest.every((t) => t === 0));
  const peak = $derived(tallest.indexOf(Math.max(...tallest)));

  /** Rect with a 4px rounded top (the data end), square at the baseline. */
  function column(x: number, top: number, h: number, rounded: boolean): string {
    const r = rounded ? Math.min(4, h, barW / 2) : 0;
    const b = top + h;
    return `M${x},${b}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${b}Z`;
  }

  // Stacked: segments bottom-up with a 2px surface gap between them.
  // Grouped: one column per series, side by side with a 2px gap.
  const stacks = $derived(
    labels.map((_, i) => {
      if (grouped) {
        const width = series.length * barW + 2 * (series.length - 1);
        const x0 = M.left + band * i + (band - width) / 2;
        const segs = series.map((s, k) => {
          const v = s.values[i] ?? 0;
          const h = (v / yMax) * plotH;
          return { d: v > 0 ? column(x0 + k * (barW + 2), M.top + plotH - h, h, true) : '', color: s.color };
        });
        return { x: x0 + (width - barW) / 2, segs, top: y(tallest[i]) };
      }
      const x = M.left + band * i + (band - barW) / 2;
      let base = M.top + plotH;
      const segs: { d: string; color: string }[] = [];
      const present = series.map((s, k) => ({ s, k, v: s.values[i] ?? 0 })).filter((p) => p.v > 0);
      present.forEach((p, j) => {
        const h = (p.v / yMax) * plotH;
        const gap = j > 0 ? 2 : 0;
        const segH = Math.max(0, h - gap);
        const top = base - gap - segH;
        segs.push({ d: column(x, top, segH, j === present.length - 1), color: p.s.color });
        base = top;
      });
      return { x, segs, top: base };
    }),
  );
</script>

<figure class="chart">
  <figcaption>
    <h3>{title}</h3>
    {#if caption}<p class="small muted">{caption}</p>{/if}
  </figcaption>
  {#if series.length > 1}
    <div class="legend" aria-hidden="true">
      {#each series as s (s.name)}<span><i style:background={s.color}></i>{s.name}</span>{/each}
    </div>
  {/if}

  {#if empty}
    <p class="none small muted">Nothing in this period.</p>
  {:else}
    <div class="plot" bind:clientWidth={width}>
      <svg
        {width}
        {height}
        role="img"
        aria-label="{title}. Values are in the table below."
        onpointerleave={() => (hovered = null)}
      >
        {#each ticks as t (t)}
          <line class="grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
          <text class="tick" x={M.left - 6} y={y(t)} dy="0.32em" text-anchor="end">{format(t)}</text>
        {/each}
        <line class="axis" x1={M.left} x2={M.left + plotW} y1={M.top + plotH} y2={M.top + plotH} />
        {#each stacks as st, i (i)}
          <g class:dim={hovered !== null && hovered !== i}>
            {#each st.segs as seg, j (j)}<path d={seg.d} fill={seg.color} />{/each}
          </g>
          {#if i % labelEvery === 0}
            <text class="tick" x={M.left + band * i + band / 2} y={height - 6} text-anchor="middle">{labels[i]}</text>
          {/if}
          {#if i === peak && tallest[i] > 0 && hovered === null}
            <text class="peak" x={st.x + barW / 2} y={st.top - 4} text-anchor="middle">{format(tallest[i])}</text>
          {/if}
          <rect
            class="hit"
            x={M.left + band * i}
            y={M.top}
            width={band}
            height={plotH}
            tabindex="0"
            role="button"
            aria-label="{labels[i]}: {series.map((s) => `${format(s.values[i] ?? 0)} ${s.name}`).join(', ')}"
            onpointerenter={() => (hovered = i)}
            onfocus={() => (hovered = i)}
            onblur={() => (hovered = null)}
          />
        {/each}
      </svg>
      {#if hovered !== null}
        {@const left = Math.min(Math.max(M.left + band * hovered + band / 2, 70), width - 70)}
        <div class="tip" style:left="{left}px" role="presentation">
          <div class="tip-title">{labels[hovered]}</div>
          {#each series as s (s.name)}
            <div class="tip-row">
              <i style:background={s.color}></i><strong>{format(s.values[hovered] ?? 0)}</strong>
              <span>{s.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <details class="table-view">
      <summary class="small">Show table</summary>
      <table>
        <thead>
          <tr><th></th>{#each series as s (s.name)}<th>{s.name}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each labels as l, i (i)}
            <tr><th>{l}</th>{#each series as s (s.name)}<td>{format(s.values[i] ?? 0)}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</figure>

<style>
  .chart {
    margin: 0;
    min-width: 0;
  }

  figcaption h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  figcaption p {
    margin: 0.1rem 0 0;
  }

  .legend {
    display: flex;
    gap: 1rem;
    margin: 0.5rem 0 0.2rem;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .legend i {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }

  .plot {
    position: relative;
    /* Measure the space available, not the drawing inside, so the chart shrinks when the screen does. */
    contain: inline-size;
    margin-top: 0.4rem;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .axis {
    stroke: var(--chart-axis);
    stroke-width: 1;
  }

  .tick {
    fill: var(--chart-ink-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .peak {
    fill: var(--text-2);
    font-size: 11px;
    font-weight: 600;
  }

  g {
    transition: opacity 0.12s;
  }

  g.dim {
    opacity: 0.45;
  }

  .hit {
    fill: transparent;
    outline: none;
  }

  .hit:focus-visible {
    stroke: var(--accent);
    stroke-width: 1.5;
  }

  .tip {
    position: absolute;
    top: 0;
    translate: -50% 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    pointer-events: none;
    white-space: nowrap;
    z-index: 5;
  }

  .tip-title {
    color: var(--text-2);
    margin-bottom: 0.15rem;
  }

  .tip-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .tip-row i {
    width: 12px;
    height: 2px;
    border-radius: 1px;
    display: inline-block;
  }

  .tip-row span {
    color: var(--text-2);
  }

  .none {
    padding: 1.5rem 0;
    margin: 0;
  }

  .table-view summary {
    cursor: pointer;
    color: var(--accent);
    margin-top: 0.3rem;
  }

  table {
    border-collapse: collapse;
    font-size: 0.8rem;
    margin-top: 0.4rem;
  }

  th,
  td {
    padding: 0.15rem 0.8rem 0.15rem 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  th:first-child {
    text-align: left;
    font-weight: 500;
  }
</style>
