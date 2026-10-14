<script lang="ts">
	import { untrack, onDestroy, type ComponentProps } from 'svelte';
	import { Button } from 'm3-svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { shiftDate, todayDate, CAMPUS_TIME_ZONE } from '$lib/datetime';
	import type { SavedMeetingsResponse } from '$lib/friends/savedMeetings';
	import UpcomingMeetings from './UpcomingMeetings.svelte';
	let {
		week,
		militaryTime,
		showList = true,
		selectedOccurrence = $bindable(''),
		ondata
	}: {
		week: string;
		militaryTime: boolean;
		showList?: boolean;
		selectedOccurrence?: string;
		ondata?: ComponentProps<typeof UpcomingMeetings>['ondata'];
	} = $props();
	const session = getPanelSession();
	const ui = getPanelUi();
	let upcoming: UpcomingMeetings | undefined = $state();
	let data = $state.raw<SavedMeetingsResponse>({ meetings: [], occurrences: [] });
	let loading = $state(false);
	let error = $state('');
	let active = true;
	let loadVersion = 0;
	onDestroy(() => {
		active = false;
		++loadVersion;
	});
	async function load(start: string, end: string, force = false) {
		if (!session.active) throw new Error('The session ended. Reopen your meetings.');
		const version = ui.meetingVersion;
		const key = `${start}:${end}`;
		if (force) session.savedMeetings.delete(key);
		const response =
			session.savedMeetings.get(key) ??
			(await session.loadSavedMeetings(start, end, () => ui.meetingVersion === version));
		if (!session.active || version !== ui.meetingVersion)
			throw new Error('Meetings changed. Refresh to load the current list.');
		return response;
	}
	async function loadWeek() {
		if (!ui.meetingEventsEnabled || showList) return;
		const version = ++loadVersion;
		const start = week;
		const meetingVersion = ui.meetingVersion;
		loading = true;
		error = '';
		data = { meetings: [], occurrences: [] };
		ondata?.(data);
		try {
			const response = await load(start, shiftDate(start, 7));
			if (
				active &&
				session.active &&
				version === loadVersion &&
				ui.meetingVersion === meetingVersion
			) {
				data = response;
				ondata?.(data);
			}
		} catch (failure) {
			if (
				active &&
				session.active &&
				version === loadVersion &&
				ui.meetingVersion === meetingVersion
			)
				error = failure instanceof Error ? failure.message : 'Could not load saved meetings.';
		} finally {
			if (active && version === loadVersion) loading = false;
		}
	}
	$effect(() => {
		const start = week;
		const version = ui.meetingVersion;
		const enabled = ui.meetingEventsEnabled;
		if (!showList && enabled && start) untrack(() => void loadWeek());
		void version;
	});
	$effect(() => {
		const occurrence = data.occurrences.find((item) => item.id === selectedOccurrence);
		const meeting = occurrence && data.meetings.find((item) => item.id === occurrence.meeting_id);
		if (meeting && occurrence) {
			ui.savedMeetingDetail = { meeting, occurrence };
			selectedOccurrence = '';
		}
	});
	export function isBusy() {
		return loading || Boolean(upcoming?.isBusy()) || ui.savedMeetingBusy;
	}
	export async function refresh() {
		if (isBusy() || !session.active) return;
		session.savedMeetings.clear();
		session.pendingSavedMeetings.clear();
		if (showList) await upcoming?.refresh();
		else await loadWeek();
	}
</script>

{#if showList && ui.meetingEventsEnabled}
	<UpcomingMeetings
		bind:this={upcoming}
		initialDate={todayDate(CAMPUS_TIME_ZONE)}
		{militaryTime}
		version={ui.meetingVersion}
		busy={ui.savedMeetingBusy}
		onload={(start, end) => load(start, end, true)}
		onmeeting={(meeting, occurrence) => (ui.savedMeetingDetail = { meeting, occurrence })}
		ondata={(value) => {
			data = value;
			ondata?.(value);
		}}
	/>
{:else if error}
	<div class="gap-2 flex items-center justify-between">
		<p class="text-sm text-error" role="alert">{error}</p>
		<Button variant="text" onclick={() => void refresh()}>Retry meetings</Button>
	</div>
{:else if !showList && loading}
	<p class="text-sm text-on-surface-variant" role="status">Loading meetings…</p>
{/if}
