<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { Button } from 'm3-svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { dateLabel, formatTime, shiftDate } from '$lib/datetime';
	import type { SavedMeeting, SavedMeetingsResponse } from '$lib/friends/savedMeetings';
	import PreviewDialog from '$lib/components/ui/PreviewDialog.svelte';
	import SavedMeetingDetail from './SavedMeetingDetail.svelte';
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

	async function load(start: string) {
		const end = shiftDate(start, 7);
		const key = `${start}:${end}`;
		const version = ++loadVersion;
		const meetingVersion = ui.meetingVersion;
		error = '';
		if (session.savedMeetings.has(key)) {
			publish(session.savedMeetings.get(key)!);
			loading = false;
			return;
		}
		publish({ meetings: [], occurrences: [] });
		loading = true;
		try {
			const response = await session.loadSavedMeetings(
				start,
				end,
				() => ui.meetingVersion === meetingVersion
			);
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

	export function isBusy() {
		return loading || busy;
	}

	export async function refresh() {
		if (isBusy() || !session.active) return;
		session.savedMeetings.clear();
		session.pendingSavedMeetings.clear();
		++ui.meetingVersion;
		await load(week);
	}
</script>

{#if showList && (loading || error || data.occurrences.length > 0)}
	<section class="gap-2 grid" aria-label="Saved meetings">
		<h2 class="text-base font-semibold">Saved meetings this week</h2>
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

{#if !showList && error}<p class="text-sm text-error" role="alert">{error}</p>{/if}

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
