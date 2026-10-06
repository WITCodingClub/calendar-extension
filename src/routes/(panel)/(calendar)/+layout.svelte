<script lang="ts">
	import CalendarShell from '$lib/components/CalendarShell.svelte';

	let { children } = $props();
</script>

<CalendarShell>{@render children()}</CalendarShell>
