<script lang="ts">
	import { Button, Chip, ConnectedButtons, Dialog, LoadingIndicator } from 'm3-svelte';
	import { onMount } from 'svelte';
	import { DAYS } from '$lib/calendar/days';
	import ComparisonList from './ComparisonList.svelte';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import WeekNavigation from '$lib/components/ui/WeekNavigation.svelte';
	import { comparisonGrid, ownerColor, type ComparisonDetail } from '$lib/friends/gridEvents';
	import {
		dateLabel,
		formatTime,
		minutesTime,
		timeMinutes,
		todayDate,
		weekDates
	} from '$lib/datetime';
	import { savedMeetingCourses } from '$lib/friends/savedMeetings';
	import { busyEndMinutes } from '$lib/friends/schedule';
	import type { CalendarPresentation } from '$lib/calendar/layout';
	import type {
		SavedMeetingsResponse,
		SavedMeetingSelectionHandler
	} from '$lib/friends/savedMeetings';
	import type {
		ComparisonMode,
		ComparisonGridEvent,
		ComparisonPerson,
		ComparisonProposal,
		ComparisonBlock
	} from '$lib/friends/comparison';
	let {
		people,
		week = $bindable(),
		mode = $bindable('detailed'),
		presentation = $bindable('auto'),
		selectedDay = $bindable(''),
		currentWeek,
		militaryTime = false,
		proposal,
		savedMeetings,
		onmeeting,
		onreturn,
		onretry,
		onedit,
		onconfirm,
		onclass
	}: {
		people: ComparisonPerson[];
		week: string;
		mode?: ComparisonMode;
		presentation?: CalendarPresentation;
		selectedDay?: string;
		currentWeek: string;
		militaryTime?: boolean;
		proposal?: ComparisonProposal;
		savedMeetings?: SavedMeetingsResponse;
		onmeeting?: SavedMeetingSelectionHandler;
		onreturn: () => void;
		onretry: (personId?: string) => void;
		onedit: () => void;
		onconfirm?: () => void;
		onclass?: (block: ComparisonBlock, date: string) => void;
	} = $props();
	let detailOpen = $state(false);
	let detailId = $state('');
	let detail = $state<ComparisonDetail>();
	let comparisonElement = $state<HTMLElement>();
	let narrow = $state(false);
	const display = $derived(presentation === 'auto' ? (narrow ? 'list' : 'calendar') : presentation);
	const dates = $derived(weekDates(week));
	const selectedEvents = $derived.by(
		() => grid.byDay[DAYS[Math.max(0, dates.indexOf(selectedDay))].key] ?? []
	);
	const shortDay = (date: string) =>
		`${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${Number(date.slice(-2))}`;
	onMount(() => {
		if (!comparisonElement) return;
		narrow = comparisonElement.clientWidth < 600;
		const observer = new ResizeObserver(([entry]) => (narrow = entry.contentRect.width < 600));
		observer.observe(comparisonElement);
		return () => observer.disconnect();
	});
	$effect(() => {
		if (dates.includes(selectedDay)) return;
		const previousDay = new Date(`${selectedDay || todayDate()}T12:00:00Z`).getUTCDay() - 1;
		selectedDay = dates[Math.min(4, Math.max(0, previousDay))];
	});
	const time = (value: number) => formatTime(minutesTime(value), militaryTime);
	const meetingTimes = $derived(
		savedMeetings
			? savedMeetingCourses(savedMeetings, dates).flatMap((course) => course.meeting_times)
			: []
	);
	const blocks = $derived(
		people.flatMap((person) =>
			dates.flatMap((date) =>
				person.days[date]?.status === 'ready'
					? person.days[date].blocks.filter((block) => block.kind !== 'buffer')
					: []
			)
		)
	);
	const startHour = $derived(
		Math.min(
			8,
			...blocks.map((block) => Math.floor(block.start / 60)),
			...meetingTimes.map((item) => Math.floor((timeMinutes(item.begin_time) ?? 0) / 60)),
			...(proposal && dates.includes(proposal.date) ? [Math.floor(proposal.start / 60)] : [])
		)
	);
	const latestHour = $derived(
		Math.max(
			17,
			...blocks.map((block) => Math.ceil(block.end / 60)),
			...meetingTimes.map((item) => Math.ceil((busyEndMinutes(item.end_time) ?? 0) / 60)),
			...(proposal && dates.includes(proposal.date) ? [Math.ceil(proposal.end / 60)] : [])
		)
	);
	const grid = $derived(comparisonGrid(people, dates, mode, startHour, proposal, savedMeetings));
	const loading = $derived(
		people.some((person) => dates.some((date) => person.days[date]?.status === 'loading'))
	);
	const issues = $derived(
		people.flatMap((person) => {
			const affected = dates.filter((date) => person.days[date]?.status !== 'ready');
			if (!affected.length) return [];
			const status = affected.some((date) => person.days[date]?.status === 'error')
				? 'error'
				: affected.some((date) => person.days[date]?.status === 'loading')
					? 'loading'
					: 'missing';
			return [{ person, status, dates: affected }];
		})
	);
	const detailTitle = $derived(
		detail?.person
			? detail.person.sharing === 'Availability only'
				? 'Busy'
				: detail.block?.title || 'Busy'
			: 'Group busy time'
	);
	const detailStart = $derived(detail?.block?.start ?? detail?.period?.start ?? 0);
	const detailEnd = $derived(detail?.block?.end ?? detail?.period?.end ?? 0);
	$effect(() => {
		if (!detailOpen || !detail) return;
		const fresh = grid.details[detailId];
		if (
			!fresh ||
			fresh.person?.sharing !== detail.person?.sharing ||
			JSON.stringify(fresh.shared) !== JSON.stringify(detail.shared) ||
			fresh.block?.start !== detail.block?.start ||
			fresh.block?.end !== detail.block?.end ||
			fresh.period?.start !== detail.period?.start ||
			fresh.period?.end !== detail.period?.end ||
			fresh.period?.people.join(',') !== detail.period?.people.join(',')
		)
			detailOpen = false;
	});
	function selectEvent(item: ComparisonGridEvent) {
		if (item.savedMeeting) onmeeting?.(item.savedMeeting.meeting, item.savedMeeting.occurrence);
		else if (item.preview) onedit();
		else {
			detailId = String(item.meeting.id);
			detail = grid.details[detailId];
			if (!detail?.shared && detail?.person?.id === 'you' && detail.block?.course && onclass)
				onclass(detail.block, detail.date);
			else detailOpen = Boolean(detail);
		}
	}
</script>

<section
	bind:this={comparisonElement}
	class="comparison friends-preview"
	aria-label="Calendar comparison"
>
	<div class="return-row"><Button variant="text" onclick={onreturn}>← Back to Friends</Button></div>
	<WeekNavigation bind:week {currentWeek} />
	<div class="view-bar">
		<ConnectedButtons>
			<input
				type="radio"
				name="comparison-view"
				id="comparison-detail"
				checked={mode === 'detailed'}
				onchange={() => {
					mode = 'detailed';
					detailOpen = false;
				}}
			/><Button for="comparison-detail">Detailed</Button>
			<input
				type="radio"
				name="comparison-view"
				id="comparison-group"
				checked={mode === 'group'}
				onchange={() => {
					mode = 'group';
					detailOpen = false;
				}}
			/><Button for="comparison-group">Group availability</Button>
		</ConnectedButtons>
		<ConnectedButtons>
			<input
				type="radio"
				name="comparison-presentation"
				id="comparison-calendar"
				checked={display === 'calendar'}
				onchange={() => (presentation = 'calendar')}
			/><Button for="comparison-calendar">Calendar</Button>
			<input
				type="radio"
				name="comparison-presentation"
				id="comparison-list"
				checked={display === 'list'}
				onchange={() => (presentation = 'list')}
			/><Button for="comparison-list">List</Button>
		</ConnectedButtons>
	</div>
	<div class="legend m3-font-body-small" aria-label="Selected calendars">
		{#each people as person (person.id)}<span title={person.sharing}
				><i style:background={ownerColor(person.id, people)}></i>{person.name}</span
			>{/each}
		{#if savedMeetings?.occurrences.length}<span
				><i
					style:background="rgb(var(--m3-scheme-tertiary-container))"
					style:border="1px solid rgb(var(--m3-scheme-tertiary))"
				></i>Meetings</span
			>{/if}
	</div>
	{#if proposal}<aside class="proposal">
			<div>
				<p class="m3-font-label-large">
					{proposal.saved ? 'Saved draft' : 'Proposed meeting'} - {proposal.title ||
						'Untitled meeting'}
				</p>
				<p class="m3-font-body-small">
					{dateLabel(proposal.date)} · {time(proposal.start)} - {time(proposal.end)}
				</p>
				{#if proposal.message}<p class="muted m3-font-body-small" role="status">
						{proposal.message}
					</p>{/if}
			</div>
			<div class="proposal-actions">
				{#if !dates.includes(proposal.date) || (display === 'list' && selectedDay !== proposal.date)}<Button
						variant="text"
						onclick={() => {
							week = weekDates(proposal!.date)[0];
							selectedDay = proposal!.date;
						}}>{display === 'list' ? 'View meeting day' : 'View meeting week'}</Button
					>{/if}<Button variant="text" onclick={onedit}
					>{proposal.saved ? 'Continue draft' : 'Back to editing'}</Button
				>{#if !proposal.saved}<Button disabled={!proposal.canConfirm} onclick={onconfirm}
						>Review & create</Button
					>{/if}
			</div>
		</aside>{/if}
	{#if !people.length}<div class="empty" role="status">
			<h2 class="m3-font-title-medium">No calendars selected</h2>
			<p class="muted m3-font-body-medium">Use Edit people on Friends to choose who to compare.</p>
			<Button variant="text" onclick={onreturn}>Back to Friends</Button>
		</div>{:else if loading}<div class="calendar-loading" role="status" aria-busy="true">
			<LoadingIndicator center={false} /><span class="m3-font-body-medium"
				>Loading schedules...</span
			>
		</div>{:else}
		{#if issues.length}<div class="calendar-errors" role="status">
				{#each issues as issue (issue.person.id)}<div class="calendar-error">
						<div>
							<p class="m3-font-label-large">
								{issue.person.name} - {issue.status === 'error'
									? 'Could not load schedule'
									: 'Schedule missing'}
							</p>
							<p class="muted m3-font-body-small">
								{issue.person.sharing === 'Sharing unavailable'
									? 'This person is not sharing a schedule.'
									: issue.status === 'error'
										? issue.person.days[issue.dates[0]]?.message ||
											'Showing the other loaded calendars. Refresh to try again.'
										: 'No schedule is available for this week. Refresh or choose another week.'}
							</p>
						</div>
						<Button variant="text" onclick={() => onretry(issue.person.id)}>Refresh</Button>
					</div>{/each}
			</div>{/if}
		{#if display === 'list'}
			<nav class="day-navigation" aria-label="Schedule day">
				{#each dates as date (date)}<Chip
						variant="general"
						selected={selectedDay === date}
						aria-pressed={selectedDay === date}
						aria-label={`Show ${dateLabel(date)}, ${date.slice(0, 4)}`}
						onclick={() => (selectedDay = date)}>{shortDay(date)}</Chip
					>{/each}
			</nav>
			<ComparisonList
				events={selectedEvents}
				date={selectedDay || dates[0]}
				{militaryTime}
				onselect={selectEvent}
			/>
		{:else}<CalendarGrid
				stackedMeetings={grid}
				{startHour}
				{latestHour}
				{militaryTime}
				{dates}
				earliestClassOffsetRem={0}
				focusOffsetRem={proposal && dates.includes(proposal.date)
					? (proposal.start / 60 - startHour) * 8
					: undefined}
				onselect={selectEvent}
			/>{/if}
	{/if}
</section>

<Dialog
	bind:open={detailOpen}
	headline={detailTitle}
	role="dialog"
	aria-label={detailTitle}
	closedby="closerequest"
>
	{#snippet buttons()}<Button variant="text" onclick={() => (detailOpen = false)}>Close</Button
		>{/snippet}
	{#if detail}<div class="detail-content">
			<p class="m3-font-body-medium">
				{dateLabel(detail.date)}, {detail.date.slice(0, 4)} · {time(detailStart)} - {time(
					detailEnd
				)}
			</p>
			{#if detail.shared}<div class="busy-details">
					{#each detail.shared as { person, block } (`${person.id}:${block.id}`)}<div>
							<h3 class="m3-font-title-medium">
								<i style:background={ownerColor(person.id, people)}></i>{person.name}
							</h3>
							<p class="m3-font-body-medium">
								{block.title || 'Busy'}<br /><span class="muted"
									>{time(block.start)} - {time(block.end)}</span
								>
							</p>
							{#if block.location}<p class="muted m3-font-body-medium">{block.location}</p>{/if}
						</div>{/each}
				</div>
			{:else if detail.person && detail.block}<p class="m3-font-title-medium">
					{detail.person.name}
				</p>
				{#if detail.person.sharing === 'Availability only'}<p class="muted m3-font-body-medium">
						Availability only · Event details are private.
					</p>{:else if detail.block.location}<p class="muted m3-font-body-medium">
						{detail.block.location}
					</p>{/if}
			{:else if detail.period}<div class="busy-details">
					{#each people.filter( (person) => detail?.period?.people.includes(person.id) ) as person (person.id)}<div
						>
							<h3 class="m3-font-title-medium">
								<i style:background={ownerColor(person.id, people)}></i>{person.name}
							</h3>
							{#each person.days[detail.date]?.blocks.filter((block) => block.kind !== 'buffer' && block.start < detailEnd && block.end > detailStart) || [] as block (block.id)}<p
									class="m3-font-body-medium"
								>
									{person.sharing === 'Availability only'
										? 'Busy · Availability only'
										: block.title || 'Busy'}<br /><span class="muted"
										>{time(block.start)} - {time(block.end)}</span
									>
								</p>{/each}
						</div>{/each}
				</div>
				<Button
					variant="text"
					onclick={() => {
						mode = 'detailed';
						detailOpen = false;
					}}>See detailed schedules</Button
				>{/if}
		</div>{/if}
</Dialog>

<style>
	.calendar-loading {
		min-height: 30rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container-low));
		border-radius: 1rem;
	}
	.calendar-errors {
		border: 1px solid rgb(var(--m3-scheme-outline-variant));
		border-radius: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container-low));
	}
	.calendar-error {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
	}
	.calendar-error + .calendar-error {
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
	}
	.calendar-error p + p {
		margin-top: 0.25rem;
	}
	.proposal-actions {
		margin-left: auto;
	}
	@media (max-width: 480px) {
		.proposal-actions :global(button) {
			flex: 1;
			min-width: 0;
			padding-inline: 0.6rem;
		}
		.proposal-actions {
			width: 100%;
			justify-content: flex-end;
		}
		.calendar-error {
			align-items: start;
		}
	}

	.comparison {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		margin: 0;
		display: grid;
		gap: 1rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	.muted {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.return-row {
		display: flex;
	}
	.view-bar,
	.legend,
	.legend > span,
	.proposal,
	.proposal-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.view-bar,
	.proposal {
		justify-content: space-between;
	}
	.day-navigation {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.legend {
		gap: 1.25rem;
	}
	.legend > span {
		gap: 0.5rem;
	}
	i {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border-radius: 0.2rem;
		flex-shrink: 0;
	}
	.proposal {
		position: sticky;
		top: var(--comparison-review-top, 0.5rem);
		z-index: 40;
		box-shadow: 0 2px 6px rgb(var(--m3-scheme-shadow) / 0.15);
		padding: 0.75rem 1rem;
		border: 1px dashed rgb(var(--m3-scheme-primary));
		border-radius: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container-high));
	}
	.proposal p + p {
		margin-top: 0.3rem;
	}
	.empty {
		display: grid;
		justify-items: start;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container-low));
	}
	.detail-content,
	.busy-details {
		display: grid;
		gap: 1rem;
	}
	.busy-details h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.busy-details p {
		margin-top: 0.3rem;
	}
</style>
