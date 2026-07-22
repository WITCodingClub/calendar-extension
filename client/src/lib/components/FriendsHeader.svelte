<script lang="ts">
	import { Button } from 'm3-svelte';

	let { onBack }: { onBack: () => void } = $props();
</script>

<div class="flex flex-row items-center gap-2 w-full">
	<Button variant="tonal" square onclick={onBack} aria-label="Back to calendar">
		<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
	</Button>
	<h1 class="text-xl font-bold text-primary">Friends</h1>
</div>
