<script lang="ts">
	import type { Snippet } from 'svelte';
	let { planner, links, meetings }: { planner: Snippet; links: Snippet; meetings: Snippet } =
		$props();
</script>

<div class="planner-frame stage friends-preview">
	<div class="planner-context">{@render planner()}</div>
	{@render links()}
	<div class="saved-section">{@render meetings()}</div>
</div>

<style>
	.stage {
		max-width: 41rem;
		margin: auto;
		width: 100%;
	}
	.planner-context {
		margin-bottom: 0.5rem;
	}
	.saved-section {
		margin-top: 1rem;
	}
</style>
