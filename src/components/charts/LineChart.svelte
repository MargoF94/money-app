<script lang="ts">
  import { niceTicks } from './ColumnChart.svelte';

  // One series over time: 2px line on a light wash, the last value labelled at its end.
  // Hover/focus shows the value; the table view lists all of them.
  let {
    title,
    labels,
    values,
    format = (n: number) => Math.round(n).toLocaleString('en-US'),
    height = 170,
    caption = '',
  }: { title: string; labels: string[]; values: number[]; format?: (n: number) => string; height?: number; caption?: string } = $props();

  let width = $state(320);
  let hovered = $state<number | null>(null);
  const M = { top: 14, right: 56, bottom: 24, left: 48 };

  // A y range around the data at clean steps (not from zero: this shows change over time).
  const range = $derived.by(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = niceTicks(Math.max(1, max - min || Math.abs(max) || 1))[1] ?? 1;
    const out: number[] = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step; v += step) out.push(v);
    return out.length > 1 ? out : [out[0] ?? 0, (out[0] ?? 0) + step];
  });
  const lo = $derived(range[0]);
  const hi = $derived(range.at(-1)!);
  const plotW = $derived(Math.max(10, width - M.left - M.right));
  const plotH = $derived(height - M.top - M.bottom);
  const x = (i: number) => M.left + (values.length > 1 ? (plotW * i) / (values.length - 1) : plotW / 2);
  const y = (v: number) => M.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const line = $derived(values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''));
  const area = $derived(`${line}L${x(values.length - 1).toFixed(1)},${M.top + plotH}L${x(0).toFixed(1)},${M.top + plotH}Z`);
  const labelEvery = $derived(Math.max(1, Math.ceil((values.length * 42) / plotW)));
</script>

<figure class="chart">
  <figcaption>
    <h3>{title}</h3>
    {#if caption}<p class="small muted">{caption}</p>{/if}
  </figcaption>
  {#if values.length === 0}
    <p class="small muted">Nothing in this period.</p>
  {:else}
    <div class="plot" bind:clientWidth={width}>
      <svg {width} {height} role="img" aria-label="{title}. Values are in the table below." onpointerleave={() => (hovered = null)}>
        {#each range as t (t)}
          <line class="grid" x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
          <text class="tick" x={M.left - 6} y={y(t)} dy="0.32em" text-anchor="end">{format(t)}</text>
        {/each}
        <path class="area" d={area} />
        <path class="line" d={line} />
        {#each labels as l, i (i)}
          {#if i % labelEvery === 0 || i === labels.length - 1}
            <text class="tick" x={x(i)} y={height - 6} text-anchor="middle">{l}</text>
          {/if}
          <rect
            class="hit"
            x={x(i) - plotW / Math.max(1, values.length - 1) / 2}
            y={M.top}
            width={plotW / Math.max(1, values.length - 1)}
            height={plotH}
            tabindex="0"
            role="button"
            aria-label="{l}: {format(values[i])}"
            onpointerenter={() => (hovered = i)}
            onfocus={() => (hovered = i)}
            onblur={() => (hovered = null)}
          />
        {/each}
        {#if hovered !== null}<circle class="dot" cx={x(hovered)} cy={y(values[hovered])} r="4.5" />{/if}
        <circle class="dot" cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="4.5" />
        <text class="end" x={x(values.length - 1) + 9} y={y(values.at(-1)!)} dy="0.32em">{format(values.at(-1)!)}</text>
      </svg>
      {#if hovered !== null}
        {@const left = Math.min(Math.max(x(hovered), 60), width - 60)}
        <div class="tip" style:left="{left}px" role="presentation"><span class="muted">{labels[hovered]}</span> <strong>{format(values[hovered])}</strong></div>
      {/if}
    </div>
    <details class="table-view">
      <summary class="small">Show table</summary>
      <table>
        <tbody>
          {#each labels as l, i (i)}<tr><th>{l}</th><td>{format(values[i])}</td></tr>{/each}
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

  .plot {
    position: relative;
    /* Measure the space available, not the drawing inside, so the chart shrinks when the screen does. */
    contain: inline-size;
    margin-top: 0.5rem;
  }

  svg {
    display: block;
    overflow: visible;
  }

  .grid {
    stroke: var(--chart-grid);
    stroke-width: 1;
  }

  .tick {
    fill: var(--chart-ink-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .end {
    fill: var(--text);
    font-size: 12px;
    font-weight: 600;
  }

  .line {
    fill: none;
    stroke: var(--series-1);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .area {
    fill: var(--wash-1);
  }

  .dot {
    fill: var(--series-1);
    stroke: var(--surface);
    stroke-width: 2;
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
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    pointer-events: none;
    white-space: nowrap;
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

  th {
    text-align: left;
    font-weight: 500;
  }
</style>
