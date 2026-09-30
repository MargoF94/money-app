<script lang="ts">
  let { label, value, sub = '' }: { label: string; value: string; sub?: string } = $props();
</script>

<div class="tile">
  <span class="label">{label}</span>
  <span class="value">{value}</span>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .label {
    font-size: 0.8rem;
    color: var(--text-2);
    font-weight: 500;
  }

  .value {
    /* Large, but small enough that ¥1,234,567 fits two tiles side by side on a narrow phone. */
    font-size: clamp(1.2rem, 5.2vw, 1.6rem);
    white-space: nowrap;
    font-weight: 600;
    line-height: 1.2;
    font-family: var(--font);
  }

  .sub {
    font-size: 0.75rem;
    color: var(--text-2);
  }
</style>
