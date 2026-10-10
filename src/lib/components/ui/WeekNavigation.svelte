<script lang="ts">
	import { Button } from 'm3-svelte';
	import { dateLabel, shiftDate, weekDates } from '$lib/datetime';
	let { week = $bindable(weekDates()[0]) }: { week?: string } = $props();
</script>

<div class="gap-2 flex flex-wrap items-center justify-between" aria-label="Calendar week">
	<p class="text-sm font-medium" aria-live="polite">Week of {dateLabel(week)}</p>
	<div class="gap-1 flex items-center">
		<Button
			variant="text"
			iconType="full"
			aria-label="Previous week"
			title="Previous week"
			onclick={() => (week = shiftDate(week, -7))}
		>
			<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"
				><path fill="currentColor" d="m15.4 7.4-1.4-1.4-6 6 6 6 1.4-1.4-4.6-4.6z" /></svg
			>
		</Button>
		<Button variant="text" onclick={() => (week = weekDates()[0])}>This week</Button>
		<Button
			variant="text"
			iconType="full"
			aria-label="Next week"
			title="Next week"
			onclick={() => (week = shiftDate(week, 7))}
		>
			<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"
				><path fill="currentColor" d="m8.6 16.6 1.4 1.4 6-6-6-6-1.4 1.4 4.6 4.6z" /></svg
			>
		</Button>
	</div>
</div>
