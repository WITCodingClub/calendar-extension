<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { Button } from 'm3-svelte';
	import type { API } from '$lib/api';
	import { dateLabel, shiftDate, todayDate, CAMPUS_TIME_ZONE, formatTime } from '$lib/datetime';
	import { REFRESH_ICON } from '$lib/icons';
	import {
		savedMeetings,
		type SavedMeeting,
		type SavedMeetingSelectionHandler,
		type SavedMeetingsResponse
	} from '$lib/friends/savedMeetings';
	let {
		initialDate = todayDate(CAMPUS_TIME_ZONE),
		militaryTime = false,
		version = 0,
		busy = false,
		onload,
		ondata,
		onmeeting
	}: {
		initialDate?: string;
		militaryTime?: boolean;
		version?: number;
		busy?: boolean;
		onload: typeof API.getSavedMeetings;
		ondata?: (data: SavedMeetingsResponse) => void;
		onmeeting: SavedMeetingSelectionHandler;
	} = $props();
	const from = $derived(initialDate);
	const until = $derived(shiftDate(from, 14));
	let data = $state.raw<SavedMeetingsResponse>({ meetings: [], occurrences: [] });
	let loading = $state(false);
	let error = $state('');
	let visibleCount = $state(3);
	let active = true;
	let loadVersion = 0;
	const ordered = $derived(
		[...data.occurrences].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
	);
	onDestroy(() => {
		active = false;
		++loadVersion;
	});
	async function load() {
		const current = ++loadVersion;
		error = '';
		loading = true;
		visibleCount = 3;
		data = { meetings: [], occurrences: [] };
		ondata?.(data);
		try {
			const response = savedMeetings(await onload(from, until));
			if (active && current === loadVersion) {
				data = response;
				ondata?.(data);
			}
		} catch (failure) {
			if (active && current === loadVersion)
				error = failure instanceof Error ? failure.message : 'Could not load saved meetings.';
		} finally {
			if (active && current === loadVersion) loading = false;
		}
	}
	$effect(() => {
		const start = from;
		const current = version;
		untrack(() => void load());
		void start;
		void current;
	});
	export function isBusy() {
		return loading || busy;
	}
	export async function refresh() {
		if (!isBusy()) await load();
	}
	function day(value: string) {
		return new Date(value + 'T00:00:00Z').toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
	function participants(item: SavedMeeting) {
		return [item.owner, ...item.friends]
			.filter((person, index, all) => all.findIndex((other) => other.id === person.id) === index)
			.map((person) => person.name)
			.concat(item.guest ? [item.guest.name || item.guest.email] : [])
			.join(', ');
	}
</script>

<section class="saved-meetings" aria-label="Saved meetings">
	<div class="section-heading">
		<div>
			<h2 class="m3-font-title-large">Upcoming meetings</h2>
			<p class="m3-font-body-small">Next 14 days - {day(from)} - {day(shiftDate(until, -1))}</p>
		</div>
		<Button
			variant="tonal"
			disabled={loading || busy}
			onclick={() => void refresh()}
			aria-label="Refresh saved meetings"
			title="Refresh saved meetings"
			><svg
				aria-hidden="true"
				width="20"
				height="20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				viewBox="0 0 24 24"
				class:animate-spin={loading}
				><path stroke-linecap="round" stroke-linejoin="round" d={REFRESH_ICON} /></svg
			></Button
		>
	</div>
	{#if loading}<p class="state m3-font-body-medium" role="status">Loading meetings...</p>
	{:else if error}<div class="state list-error">
			<p class="text-error" role="alert">{error}</p>
			<Button variant="text" onclick={() => void refresh()}>Retry</Button>
		</div>
	{:else if !ordered.length}<p class="state m3-font-body-medium">
			No meetings in the next 14 days.
		</p>
	{:else}<ul class="meeting-list">
			{#each ordered.slice(0, visibleCount) as occurrence (occurrence.id)}
				{@const item = data.meetings.find((item) => item.id === occurrence.meeting_id)!}
				<li class="meeting-row">
					<div class="date-mark" aria-hidden="true">
						<span
							>{new Date(`${occurrence.start_time.slice(0, 10)}T00:00:00Z`).toLocaleDateString(
								'en-US',
								{ timeZone: 'UTC', month: 'short' }
							)}</span
						><strong>{Number(occurrence.start_time.slice(8, 10))}</strong>
					</div>
					<div class="meeting-info">
						<div class="title-line">
							<h3 class="m3-font-title-medium">{item.title}</h3>
							<span class="role m3-font-label-small"
								>{item.role === 'owner' ? 'Organizer' : 'Invited'}</span
							>
						</div>
						<p class="m3-font-body-medium">
							{dateLabel(occurrence.start_time.slice(0, 10))} - {formatTime(
								occurrence.start_time.slice(11, 16),
								militaryTime
							)} - {formatTime(
								occurrence.end_time.slice(11, 16),
								militaryTime
							)}{#if occurrence.start_time.slice(0, 10) !== occurrence.end_time.slice(0, 10)}
								({day(occurrence.end_time.slice(0, 10))}){/if}
						</p>
						<p class="people m3-font-body-small">{participants(item)}</p>
						<p class="repeat m3-font-body-small">
							{item.frequency === 'weekly'
								? `Weekly${item.repeat_until ? ` through ${day(item.repeat_until)}` : ''}`
								: 'One-time meeting'}
						</p>
					</div>
					<Button
						variant="text"
						disabled={busy}
						aria-label={`Details for ${item.title}, ${dateLabel(occurrence.start_time.slice(0, 10))}`}
						onclick={() => onmeeting(item, occurrence)}>Details</Button
					>
				</li>
			{/each}
		</ul>
		{#if ordered.length > visibleCount}<div class="load-more">
				<Button variant="text" disabled={busy} onclick={() => (visibleCount += 3)}>Load more</Button
				>
			</div>{/if}{/if}
</section>

<style>
	.saved-meetings {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid color-mix(in srgb, rgb(var(--m3-scheme-outline-variant)) 65%, transparent);
		border-radius: 1rem;
		background: rgb(var(--m3-scheme-surface-container-low));
		color: rgb(var(--m3-scheme-on-surface));
	}
	.section-heading,
	.title-line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	.section-heading p,
	.people,
	.repeat {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.section-heading p {
		margin-top: 0.25rem;
	}
	.meeting-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
	}
	.meeting-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 0;
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
	}
	.load-more {
		display: flex;
		justify-content: center;
	}
	.meeting-info {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 0.375rem;
		overflow-wrap: anywhere;
	}
	.title-line {
		justify-content: flex-start;
		flex-wrap: wrap;
	}
	.role {
		padding: 0.125rem 0.5rem;
		border-radius: 0.5rem;
		background: rgb(var(--m3-scheme-secondary-container));
		color: rgb(var(--m3-scheme-on-secondary-container));
	}
	.date-mark {
		display: grid;
		text-align: center;
		align-content: center;
		min-width: 2.5rem;
		color: rgb(var(--m3-scheme-primary));
	}
	.date-mark span {
		font-size: 0.75rem;
	}
	.date-mark strong {
		font-size: 1.5rem;
	}
	.list-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.list-error p {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.list-error :global(button) {
		flex-shrink: 0;
	}
	.state {
		padding: 1rem;
		border-radius: 1rem;
		background: rgb(var(--m3-scheme-surface-container-low));
	}
	@media (max-width: 480px) {
		.meeting-row {
			flex-wrap: wrap;
			padding: 0.75rem 0;
		}
		.load-more {
			display: flex;
			justify-content: center;
		}
		.meeting-info {
			flex-basis: calc(100% - 3.25rem);
		}
		.meeting-row :global(button) {
			margin-left: auto;
		}
	}
</style>
