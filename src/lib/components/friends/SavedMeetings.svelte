<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { Button } from 'm3-svelte';
	import { API } from '$lib/api';
	import { getPanelSession } from '$lib/panelSession';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { dateLabel, shiftDate } from '$lib/calendarDates';
	import type { SavedMeeting, SavedMeetingsResponse } from '$lib/savedMeetings';
	import PreviewDialog from './PreviewDialog.svelte';
	import SavedMeetingDetail from './SavedMeetingDetail.svelte';
	import { formatTime } from './formatTime';
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
		ondata?: (data: SavedMeetingsResponse) => void;
	} = $props();
	const session = getPanelSession();
	const ui = getPanelUi();
	let data = $state.raw<SavedMeetingsResponse>({ meetings: [], occurrences: [] });
	let loading = $state(false);
	let error = $state('');
	let busy = $state(false);
	let active = true;
	let loadVersion = 0;
	const selected = $derived(
		data.occurrences.find((occurrence) => occurrence.id === selectedOccurrence)
	);
	const meeting = $derived(
		selected && data.meetings.find((meeting) => meeting.id === selected.meeting_id)
	);
	onDestroy(() => {
		active = false;
	});

	function publish(value: SavedMeetingsResponse) {
		data = value;
		ondata?.(value);
	}

	async function load(start: string, force = false) {
		const end = shiftDate(start, 7);
		const key = `${start}:${end}`;
		const version = ++loadVersion;
		const meetingVersion = ui.meetingVersion;
		error = '';
		if (!force && session.savedMeetings.has(key)) {
			publish(session.savedMeetings.get(key)!);
			loading = false;
			return;
		}
		publish({ meetings: [], occurrences: [] });
		loading = true;
		try {
			if (force) {
				session.savedMeetings.delete(key);
				session.pendingSavedMeetings.delete(key);
			}
			let request = session.pendingSavedMeetings.get(key);
			if (!request) {
				request = API.getSavedMeetings(start, end);
				session.pendingSavedMeetings.set(key, request);
				const pending = request;
				request
					.then((response) => {
						if (
							session.active &&
							ui.meetingVersion === meetingVersion &&
							session.pendingSavedMeetings.get(key) === pending
						)
							session.savedMeetings.set(key, response);
					})
					.finally(() => {
						if (session.pendingSavedMeetings.get(key) === pending)
							session.pendingSavedMeetings.delete(key);
					})
					.catch(() => undefined);
			}
			const response = await request;
			if (
				active &&
				session.active &&
				version === loadVersion &&
				ui.meetingVersion === meetingVersion
			)
				publish(response);
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
		untrack(() => {
			selectedOccurrence = '';
			void load(start);
		});
		void version;
	});

	async function update(updated: SavedMeeting) {
		if (!session.active) return;
		if (active)
			publish({
				...data,
				meetings: data.meetings.map((item) => (item.id === updated.id ? updated : item))
			});
		ui.invalidateMeetings(session);
	}

	function remove(id: string) {
		if (!session.active) return;
		if (active) {
			publish({
				meetings: data.meetings.filter((item) => item.id !== id),
				occurrences: data.occurrences.filter((item) => item.meeting_id !== id)
			});
			selectedOccurrence = '';
		}
		ui.invalidateMeetings(session);
	}

	function refresh() {
		if (loading || busy) return;
		ui.invalidateMeetings(session);
	}
</script>

{#if showList && data.occurrences.length > 0}
	<section class="gap-2 grid" aria-label="Saved meetings">
		<h2 class="text-base font-semibold">Saved meetings this week</h2>
		{#if data.meetings.length > 1}
			<Button variant="text" disabled={loading || busy} onclick={refresh}>Refresh meetings</Button>
		{/if}
		{#if loading}<p class="text-sm text-on-surface-variant" role="status">Loading meetings…</p>
		{:else if error}<p class="text-sm text-error" role="alert">{error}</p>
		{:else}
			<ul class="gap-2 grid">
				{#each data.occurrences as occurrence (occurrence.id)}
					{@const item = data.meetings.find((meeting) => meeting.id === occurrence.meeting_id)!}
					<li
						class="gap-2 rounded-xl bg-surface-container-low p-3 flex items-center justify-between"
					>
						<div class="min-w-0">
							<p class="text-sm font-medium">
								{item.title}{item.role === 'invitee' ? ' · Invited' : ''}
							</p>
							<p class="text-xs text-on-surface-variant">
								{dateLabel(occurrence.start_time.slice(0, 10))} · {formatTime(
									occurrence.start_time.slice(11, 16),
									militaryTime
								)}–{formatTime(occurrence.end_time.slice(11, 16), militaryTime)}{item.frequency ===
								'weekly'
									? ' · Weekly'
									: ''}
							</p>
						</div>
						<Button variant="text" onclick={() => (selectedOccurrence = occurrence.id)}
							>Details</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

{#if selected && meeting}
	<PreviewDialog
		open
		title={meeting.title}
		closable={!busy}
		onclose={() => (selectedOccurrence = '')}
	>
		{#key selected.id}
			<SavedMeetingDetail
				{meeting}
				occurrence={selected}
				{militaryTime}
				onupdate={update}
				ondelete={remove}
				onleave={remove}
				onbusy={(value) => (busy = value)}
			/>
		{/key}
	</PreviewDialog>
{/if}
