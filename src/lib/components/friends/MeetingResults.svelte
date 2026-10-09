<script lang="ts">
	import { Button, snackbar } from 'm3-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { FreePeriod } from './types';
	import { minutesTime, meetingSlot, meetingMessage } from './availability';
	import { processedData } from '$lib/store';
	import { formatTime } from './formatTime';
	import { getPanelUi } from '$lib/panelUi.svelte';
	const ui = getPanelUi();
	let {
		periods,
		duration,
		message,
		starts = $bindable<Record<string, number>>({}),
		militaryTime
	}: {
		periods: FreePeriod[];
		duration: number;
		message?: string;
		starts?: Record<string, number>;
		militaryTime: boolean;
	} = $props();
	let limit = $state(5);
	const days = $derived.by(() => {
		const grouped = new SvelteMap<string, { date: string; day: string; periods: FreePeriod[] }>();
		for (const period of periods) {
			const day = grouped.get(period.date);
			if (day) day.periods.push(period);
			else grouped.set(period.date, { date: period.date, day: period.day, periods: [period] });
		}
		return [...grouped.values()];
	});

	function choose(period: FreePeriod) {
		if (ui.meetingDraft?.submission) {
			ui.meetingDetails = true;
			ui.meetingEditorOpen = true;
			snackbar('Retry the current meeting before starting another.', undefined, true);
			return;
		}
		const start = starts[period.id];
		const draft = {
			period,
			slot: meetingSlot(
				period,
				start !== undefined && start >= period.start && start + duration <= period.end
					? start
					: period.start,
				duration
			),
			title: '',
			location: '',
			destinations: ['ics'] as Array<'google' | 'microsoft' | 'ics'>,
			destinationDefaultsPending: true,
			inviteFriends: true,
			frequency: 'one_time' as const,
			idempotencyKey: crypto.randomUUID()
		};
		const ownCourses = $processedData.find((item) => String(item.termId) === ui.scheduleTerm)
			?.responseData.classes;
		const error = meetingMessage(ui, ownCourses, draft.slot);
		if (error) {
			snackbar(error, undefined, true);
			return;
		}
		ui.highlightedSlot = undefined;
		ui.restoredPreview = undefined;
		ui.meetingDraft = draft;
		ui.meetingDetails = false;
		ui.meetingEditorOpen = true;
	}
</script>

<section
	class="min-w-0 gap-3 rounded-2xl border-outline-variant/65 bg-surface-container-low p-3 grid border"
	aria-labelledby="preview-results-title"
>
	<div>
		<h3 id="preview-results-title">Shared free periods</h3>
		<p class="mt-1 text-sm text-on-surface-variant">Choose a free period to set up your meeting.</p>
	</div>
	{#if message}<p role="status" class="text-sm text-on-surface-variant">{message}</p>
	{:else if !periods.length}<p role="status" class="text-sm text-on-surface-variant">
			No shared free periods fit these preferences.
		</p>
	{:else}
		<div class="divide-outline-variant/65 divide-y">
			{#each days.slice(0, limit) as day (day.date)}
				<details open class="group py-1">
					<summary
						class="gap-2 rounded-lg px-1 py-2 text-sm hover:bg-surface-container-high focus-visible:outline-primary flex cursor-pointer list-none items-center focus-visible:outline-2 [&::-webkit-details-marker]:hidden"
					>
						<svg
							aria-hidden="true"
							viewBox="0 0 24 24"
							class="size-4 text-on-surface-variant shrink-0 transition-transform group-open:rotate-90"
							><path fill="currentColor" d="m9 6 6 6-6 6" /></svg
						>
						<span class="font-medium">{day.day}</span>
						<span class="text-xs text-on-surface-variant ml-auto">
							{day.periods.length}
							{day.periods.length === 1 ? 'period' : 'periods'}
						</span>
					</summary>
					<div class="gap-1 pb-2 grid">
						{#each day.periods as period (period.id)}
							<button
								type="button"
								class="gap-2 rounded-lg bg-surface-container px-3 py-2 text-sm hover:bg-secondary-container hover:text-on-secondary-container focus-visible:outline-primary flex items-center justify-between text-left focus-visible:outline-2"
								onclick={() => choose(period)}
							>
								<span class="font-medium tabular-nums">
									{formatTime(minutesTime(period.start), militaryTime)}–{formatTime(
										minutesTime(period.end),
										militaryTime
									)}
								</span>
								<svg aria-hidden="true" viewBox="0 0 24 24" class="size-4 shrink-0"
									><path fill="currentColor" d="m9 6 6 6-6 6" /></svg
								>
							</button>
						{/each}
					</div>
				</details>
			{/each}
		</div>
		{#if days.length > limit}<Button variant="text" onclick={() => (limit += 5)}
				>Show more days</Button
			>{/if}
	{/if}
</section>
