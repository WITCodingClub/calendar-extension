<script lang="ts">
	import { ADD_PERSON_ICON, REFRESH_ICON } from '$lib/icons';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'm3-svelte';
	import { processedData, termClasses, userSettings } from '$lib/stores';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import ParticipantPicker from './ParticipantPicker.svelte';
	import MeetingPreferences from './MeetingPreferences.svelte';
	import MeetingResults from './MeetingResults.svelte';
	import MeetingLinks from './MeetingLinks.svelte';
	import SavedMeetings from './SavedMeetings.svelte';
	import { scheduleAvailability } from '$lib/friends/availability';
	const ui = getPanelUi();
	let links: MeetingLinks | undefined = $state();
	let meetings: SavedMeetings | undefined = $state();
	let refreshing = $state(false);
	const militaryTime = $derived($userSettings?.military_time ?? true);
	const ownCourses = $derived(
		ui.scheduleTerm
			? termClasses($processedData, ui.scheduleTerm)
			: $processedData.at(-1)?.responseData.classes
	);
	const availability = $derived(scheduleAvailability(ui, ownCourses));

	function compare() {
		ui.term = ui.scheduleTerm ?? ui.term;
		ui.comparison = true;
		void goto(resolve('/calendar'));
	}

	async function refresh() {
		if (refreshing || links?.isBusy() || meetings?.isBusy()) return;
		refreshing = true;
		try {
			await Promise.all([ui.friendActions?.refresh(), links?.reload(), meetings?.refresh()]);
		} finally {
			refreshing = false;
		}
	}
</script>

<main class="min-w-0 gap-4 grid">
	<div class="gap-2 flex flex-wrap items-center justify-between">
		<div class="gap-2 flex flex-wrap items-center">
			<ParticipantPicker bind:selected={ui.selected} />
			{#if ui.hasSelectedFriends}<Button variant="tonal" onclick={() => compare()}
					>Compare calendars</Button
				>{/if}
		</div>
		<div class="ml-auto shrink-0">
			<Button
				variant="tonal"
				disabled={refreshing ||
					links?.isBusy() ||
					meetings?.isBusy() ||
					Boolean(ui.actionLoadingId || ui.groupLoadingId)}
				onclick={() => void refresh()}
				aria-label="Refresh friends"
				title="Refresh friends"
			>
				<svg
					aria-hidden="true"
					width="20"
					height="20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					class:animate-spin={refreshing}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={REFRESH_ICON} />
				</svg>
			</Button>
		</div>
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
	{:else}
		{#if ui.friendsError}<p class="text-sm text-error" role="alert">{ui.friendsError}</p>
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
						><path fill="currentColor" d={ADD_PERSON_ICON} /></svg
					>Add friends</Button
				>{/if}
		</div>
	{/if}
	<MeetingLinks bind:this={links} />
	<SavedMeetings bind:this={meetings} week={ui.week} {militaryTime} />
</main>
