<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { Button } from 'm3-svelte';
	import { API } from '$lib/api';
	import { getPanelSession } from '$lib/panelSession';
	import { dateLabel, shiftDate } from '$lib/calendarDates';
	import {
		savedMeetingOverlaps,
		type SavedMeeting,
		type SavedMeetingsResponse
	} from '$lib/savedMeetings';
	import PreviewDialog from './PreviewDialog.svelte';
	import SavedMeetingDetail from './SavedMeetingDetail.svelte';
	import { formatTime } from './formatTime';
	let {
		week,
		militaryTime,
		selectedOccurrence = $bindable(''),
		ondata
	}: {
		week: string;
		militaryTime: boolean;
		selectedOccurrence?: string;
		ondata: (data: SavedMeetingsResponse) => void;
	} = $props();
	const session = getPanelSession();
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
		ondata(value);
	}

	async function load(start: string, force = false) {
		const end = shiftDate(start, 7);
		const key = `${start}:${end}`;
		const version = ++loadVersion;
		error = '';
		if (!force && session.savedMeetings.has(key)) {
			publish(session.savedMeetings.get(key)!);
			loading = false;
			return;
		}
		publish({ meetings: [], occurrences: [] });
		loading = true;
		try {
			let request = session.pendingSavedMeetings.get(key);
			if (!request) {
				request = API.getSavedMeetings(start, end);
				session.pendingSavedMeetings.set(key, request);
				const pending = request;
				request
					.then((response) => {
						if (session.active && session.pendingSavedMeetings.get(key) === pending)
							session.savedMeetings.set(key, response);
					})
					.finally(() => {
						if (session.pendingSavedMeetings.get(key) === pending)
							session.pendingSavedMeetings.delete(key);
					})
					.catch(() => undefined);
			}
			const response = await request;
			if (active && session.active && version === loadVersion) publish(response);
		} catch (failure) {
			if (active && session.active && version === loadVersion)
				error = failure instanceof Error ? failure.message : 'Could not load saved meetings.';
		} finally {
			if (active && version === loadVersion) loading = false;
		}
	}

	$effect(() => {
		const start = week;
		untrack(() => {
			selectedOccurrence = '';
			void load(start);
		});
	});

	async function update(updated: SavedMeeting) {
		if (!active || !session.active) return;
		const previous = meeting!;
		const moved =
			previous.start_time !== updated.start_time ||
			previous.end_time !== updated.end_time ||
			previous.repeat_until !== updated.repeat_until;
		for (const key of new Set([
			...session.savedMeetings.keys(),
			...session.pendingSavedMeetings.keys()
		])) {
			const [start, end] = key.split(':');
			if (!savedMeetingOverlaps(previous, start, end) && !savedMeetingOverlaps(updated, start, end))
				continue;
			session.pendingSavedMeetings.delete(key);
			const cached = session.savedMeetings.get(key);
			if (moved) session.savedMeetings.delete(key);
			else if (cached)
				session.savedMeetings.set(key, {
					...cached,
					meetings: cached.meetings.map((item) => (item.id === updated.id ? updated : item))
				});
		}
		if (moved) {
			selectedOccurrence = '';
			await load(week, true);
		} else
			publish({
				...data,
				meetings: data.meetings.map((item) => (item.id === updated.id ? updated : item))
			});
	}

	function remove() {
		if (!active || !session.active) return;
		const id = meeting!.id;
		for (const [key, cached] of session.savedMeetings) {
			session.savedMeetings.set(key, {
				meetings: cached.meetings.filter((item) => item.id !== id),
				occurrences: cached.occurrences.filter((item) => item.meeting_id !== id)
			});
		}
		for (const key of session.pendingSavedMeetings.keys()) {
			const [start, end] = key.split(':');
			if (savedMeetingOverlaps(meeting!, start, end)) session.pendingSavedMeetings.delete(key);
		}
		publish({
			meetings: data.meetings.filter((item) => item.id !== id),
			occurrences: data.occurrences.filter((item) => item.meeting_id !== id)
		});
		selectedOccurrence = '';
	}
</script>

<section class="gap-2 grid" aria-label="Saved meetings">
	<h2 class="text-base font-semibold">Saved meetings this week</h2>
	{#if loading}<p class="text-sm text-on-surface-variant" role="status">Loading meetings…</p>
	{:else if error}<p class="text-sm text-error" role="alert">{error}</p>
		<Button variant="text" onclick={() => load(week, true)}>Reload meetings</Button>
	{:else if !data.occurrences.length}<p class="text-sm text-on-surface-variant">
			No saved meetings this week.
		</p>
	{:else}
		<ul class="gap-2 grid">
			{#each data.occurrences as occurrence (occurrence.id)}
				{@const item = data.meetings.find((meeting) => meeting.id === occurrence.meeting_id)!}
				<li class="gap-2 rounded-xl bg-surface-container-low p-3 flex items-center justify-between">
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
				onbusy={(value) => (busy = value)}
			/>
		{/key}
	</PreviewDialog>
{/if}
