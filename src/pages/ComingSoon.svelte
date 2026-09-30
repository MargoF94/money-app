<script lang="ts">
  let { title, text }: { title: string; text: string } = $props();
</script>

<h1>{title}</h1>
<div class="card empty">
  <p>{text}</p>
  <p class="small">See the mockups for what it will look like.</p>
</div>
