<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'm3-svelte';
	import { processedData, userSettings } from '$lib/store';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import ParticipantPicker from './ParticipantPicker.svelte';
	import MeetingPreferences from './MeetingPreferences.svelte';
	import MeetingResults from './MeetingResults.svelte';
	import MeetingLinks from './MeetingLinks.svelte';
	import { scheduleAvailability } from './availability';
	const ui = getPanelUi();
	const militaryTime = $derived($userSettings?.military_time ?? true);
	const ownCourses = $derived(
		(ui.scheduleTerm
			? $processedData.find((item) => String(item.termId) === ui.scheduleTerm)
			: $processedData.at(-1)
		)?.responseData.classes
	);
	const availability = $derived(scheduleAvailability(ui, ownCourses));

	function compare() {
		ui.term = ui.scheduleTerm ?? ui.term;
		ui.comparison = true;
		void goto(resolve('/calendar'));
	}
</script>

<main class="min-w-0 gap-4 grid">
	<div class="gap-2 flex flex-wrap items-center justify-between">
		<ParticipantPicker bind:selected={ui.selected} />
		{#if ui.hasSelectedFriends}<Button variant="tonal" onclick={() => compare()}
				>Compare calendars</Button
			>{/if}
	</div>
	{#if ui.hasSelectedFriends}
		<MeetingPreferences
			{militaryTime}
			bind:preferences={ui.preferences}
			bounds={ui.scheduleTerm ? ui.termBounds[ui.scheduleTerm] : undefined}
		/>
		<MeetingResults
			periods={availability.periods}
			message={availability.message}
			duration={Number(ui.preferences.duration)}
			bind:starts={ui.starts}
			{militaryTime}
		/>
		<Button variant="text" onclick={() => ui.friendActions?.retrySchedules()}
			>Reload schedules</Button
		>
	{:else}
		{#if ui.friendsError}<p class="text-sm text-error" role="alert">{ui.friendsError}</p>
			<Button variant="text" onclick={() => ui.friendActions?.reload()}>Reload friends</Button>
		{/if}
		<div class="gap-3 rounded-2xl bg-surface-container-low p-4 grid" role="status">
			<p class="text-sm text-on-surface-variant">
				{ui.friendsLoading
					? 'Loading friends…'
					: ui.friends.length
						? 'Select some friends using People to start planning.'
						: 'Add some friends to start planning together.'}
			</p>
			{#if !ui.friendsLoading && !ui.friends.length}<Button
					variant="tonal"
					iconType="left"
					onclick={() => (ui.manageOpen = true)}
					><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
						><path
							fill="currentColor"
							d="M12.5 11.95q.725-.8 1.113-1.825T14 8t-.387-2.125T12.5 4.05q1.5.2 2.5 1.325T16 8t-1 2.625t-2.5 1.325M17.45 20q.275-.45.413-.962T18 18v-1q0-.9-.4-1.713t-1.05-1.437q1.275.45 2.363 1.163T20 17v1q0 .825-.587 1.413T18 20zM20 11h-1q-.425 0-.712-.288T18 10t.288-.712T19 9h1V8q0-.425.288-.712T21 7t.713.288T22 8v1h1q.425 0 .713.288T24 10t-.288.713T23 11h-1v1q0 .425-.288.713T21 13t-.712-.288T20 12zm-14.825-.175Q4 9.65 4 8t1.175-2.825T8 4t2.825 1.175T12 8t-1.175 2.825T8 12t-2.825-1.175M0 18v-.8q0-.85.438-1.562T1.6 14.55q1.55-.775 3.15-1.162T8 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T16 17.2v.8q0 .825-.587 1.413T14 20H2q-.825 0-1.412-.587T0 18"
						/></svg
					>Add friends</Button
				>{/if}
		</div>
	{/if}
	<MeetingLinks />
</main>
