<script lang="ts">
	import { Button } from 'm3-svelte';
	import { CALENDAR_ICON } from '$lib/icons';
	import { busyEndMinutes } from '$lib/friends/schedule';
	import { DAYS } from '$lib/calendar/days';
	import { dateLabel, formatTime, timeMinutes } from '$lib/datetime';
	import OwnerStrips from './OwnerStrips.svelte';
	import SharedClassIcon from './SharedClassIcon.svelte';
	import type { ComparisonGridEvent } from '$lib/friends/comparison';
	let {
		events,
		date,
		militaryTime = false,
		onselect,
		showDates = true
	}: {
		events: ComparisonGridEvent[];
		date: string;
		militaryTime?: boolean;
		onselect: (item: ComparisonGridEvent) => void;
		showDates?: boolean;
	} = $props();
	const ordered = $derived(
		events.toSorted(
			(a, b) => (timeMinutes(a.meeting.begin_time) ?? 0) - (timeMinutes(b.meeting.begin_time) ?? 0)
		)
	);
	const weekday = $derived(DAYS[Math.max(0, (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7)]);
	const displayDate = $derived(
		showDates ? dateLabel(date) + ', ' + date.slice(0, 4) : weekday.label
	);
	const title = (item: ComparisonGridEvent) =>
		item.meeting.title_overrides?.[weekday.key] ?? item.course.title;
</script>

<section class="day-list" aria-label={`Schedule list for ${displayDate}`}>
	<h2 class="m3-font-title-medium">{displayDate}</h2>
	{#if !ordered.length}
		<p class="m3-font-body-medium text-on-surface-variant" role="status">
			No events scheduled for this day.
		</p>
	{/if}
	<ol>
		{#each ordered as item (`${item.ownerId ?? 'group'}:${item.meeting.id}`)}<li
				class:proposed={item.preview}
				class:saved-meeting={Boolean(item.savedMeeting)}
				class:final-exam={String(item.meeting.id).startsWith('final:')}
			>
				<Button
					variant="text"
					style="height: auto; padding: .75rem; border-radius: .5rem"
					aria-label={`${item.savedMeeting ? 'Saved meeting - ' : item.ownerLabel ? `${item.ownerLabel} - ` : ''}${item.preview ? 'Proposed meeting' : title(item)}, ${displayDate}, ${formatTime(item.meeting.begin_time, militaryTime)} to ${formatTime(item.meeting.end_time, militaryTime)}`}
					onclick={() => onselect(item)}
				>
					<div class="list-row">
						{#if item.sharedOwners}<SharedClassIcon owners={item.sharedOwners} />{/if}
						<span class="row-heading m3-font-label-large" class:pr-5={Boolean(item.sharedOwners)}
							>{#if item.savedMeeting}<svg aria-hidden="true" class="saved-icon" viewBox="0 0 24 24"
									><path fill="currentColor" d={CALENDAR_ICON} /></svg
								>{:else if item.ownerLabel}<i style:background={item.bgColor}
								></i>{/if}{`${item.ownerLabel ? `${item.ownerLabel} - ` : ''}${item.preview ? 'Proposed meeting' : title(item)}`}</span
						><span class="row-time m3-font-body-medium"
							>{formatTime(item.meeting.begin_time, militaryTime)} - {formatTime(
								item.meeting.end_time,
								militaryTime
							)}</span
						>{#if item.savedMeeting}<span class="row-time m3-font-body-small"
								>Meeting · {item.savedMeeting.meeting.frequency === 'weekly' ? 'Weekly' : 'Once'} · {item
									.savedMeeting.meeting.role === 'owner'
									? 'You organize'
									: `Organized by ${item.savedMeeting.meeting.owner.name}`}</span
							>{/if}{#if item.ownerStrips?.length}<OwnerStrips
								strips={item.ownerStrips}
								start={timeMinutes(item.meeting.begin_time) ?? 0}
								end={busyEndMinutes(item.meeting.end_time) ?? 0}
								{militaryTime}
							/>{/if}
					</div>
				</Button>
			</li>{/each}
	</ol>
</section>

<style>
	li.final-exam {
		border-color: rgb(var(--m3-scheme-error));
		background: rgb(var(--m3-scheme-error-container));
	}

	.final-exam .list-row,
	.final-exam .row-time {
		color: rgb(var(--m3-scheme-on-error-container));
	}

	.saved-icon {
		width: 1rem;
		height: 1rem;
		display: inline-block;
		vertical-align: text-bottom;
		margin-inline-end: 0.35rem;
	}
	.day-list {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		min-height: 12rem;
		border-radius: 1rem;
		padding: 1rem;
		background: rgb(var(--m3-scheme-surface-container-low));
	}
	h2 {
		margin: 0 0 0.75rem;
	}
	ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		border: 1px solid rgb(var(--m3-scheme-outline-variant));
		border-radius: 0.6rem;
		overflow: hidden;
	}
	li.saved-meeting {
		border-color: rgb(var(--m3-scheme-tertiary));
		background: rgb(var(--m3-scheme-tertiary-container));
	}
	li.proposed {
		border: 2px dashed rgb(var(--m3-scheme-primary));
		background: rgb(var(--m3-scheme-primary-container));
	}
	li :global(button) {
		width: 100%;
		height: auto;
		min-height: 4rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
	}
	.list-row {
		position: relative;
		display: grid;
		gap: 0.35rem;
		width: 100%;
		min-width: 0;
		text-align: left;
		white-space: normal;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.saved-meeting .list-row,
	.saved-meeting .row-time {
		color: rgb(var(--m3-scheme-on-tertiary-container));
	}
	.proposed .list-row,
	.proposed .row-time {
		color: rgb(var(--m3-scheme-on-primary-container));
	}
	.row-heading {
		overflow-wrap: anywhere;
	}
	.row-time {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	i {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 0.15rem;
		margin-inline-end: 0.5rem;
	}
</style>
