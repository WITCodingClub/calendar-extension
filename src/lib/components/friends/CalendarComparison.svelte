<script lang="ts">
	import { Button, ConnectedButtons } from 'm3-svelte';
	import WeekNavigation from '$lib/components/WeekNavigation.svelte';
	import { todayDate } from '$lib/calendarDates';
	import CalendarGrid, { type CalendarGridEvent } from '$lib/components/CalendarGrid.svelte';
	import type { Course, DayItem } from '$lib/types';
	import PreviewDialog from './PreviewDialog.svelte';
	import { type Participant, type PreviewSlot } from './types';
	import { dateLabel, mergeBusy, minutesTime, timeMinutes, weekDates } from './availability';
	import { formatTime } from './formatTime';
	import { getPanelUi } from '$lib/panelUi.svelte';
	const ui = getPanelUi();

	let {
		participants,
		comparison,
		slot,
		date,
		week = $bindable(weekDates(date)[0]),
		ownEvents,
		friendSchedules,
		onownselect,
		onexit,
		onedit,
		militaryTime
	}: {
		participants: Participant[];
		comparison: boolean;
		slot?: PreviewSlot;
		date: string;
		week?: string;
		ownEvents?: { byDay: Record<string, CalendarGridEvent[]> };
		friendSchedules: Record<string, Course[]>;
		onownselect?: (item: CalendarGridEvent, day: DayItem) => void;
		onexit: () => void;
		onedit: () => void;
		militaryTime: boolean;
	} = $props();
	let detail = $state<{ item: CalendarGridEvent; day: DayItem; date: string }>();
	const mode = $derived(
		ui.comparisonDisplay ?? (slot || participants.length > 3 ? 'group' : 'detailed')
	);
	$effect(() => {
		if (slot?.id) ui.comparisonDisplay = 'group';
	});
	const visiblePeople = $derived(
		comparison ? participants : participants.filter((person) => person.id === 'you')
	);
	const days: DayItem[] = [
		{ key: 'monday', label: 'Monday', abbr: 'M', order: 0 },
		{ key: 'tuesday', label: 'Tuesday', abbr: 'T', order: 1 },
		{ key: 'wednesday', label: 'Wednesday', abbr: 'W', order: 2 },
		{ key: 'thursday', label: 'Thursday', abbr: 'Th', order: 3 },
		{ key: 'friday', label: 'Friday', abbr: 'F', order: 4 }
	];
	const dates = $derived(weekDates(week));
	const upcomingSlot = $derived(slot && slot.date >= todayDate() ? slot : undefined);
	const visibleSlot = $derived(
		upcomingSlot && dates.includes(upcomingSlot.date) ? upcomingSlot : undefined
	);
	const meetings = $derived([
		...visiblePeople
			.filter((person) => person.id !== 'you')
			.flatMap((person) =>
				(friendSchedules[person.id] ?? []).flatMap((course) => course.meeting_times ?? [])
			),
		...(visiblePeople.some((person) => person.id === 'you')
			? Object.values(ownEvents?.byDay ?? {})
					.flat()
					.map((item) => item.meeting)
			: [])
	]);
	const startHour = $derived(
		Math.min(
			8,
			...meetings.map((meeting) => Math.floor(timeMinutes(meeting.begin_time)! / 60)),
			...(visibleSlot ? [Math.floor(timeMinutes(visibleSlot.start)! / 60)] : [])
		)
	);
	const latestHour = $derived(
		Math.max(
			17,
			...meetings.map((meeting) => Math.ceil(timeMinutes(meeting.end_time)! / 60)),
			...(visibleSlot ? [Math.ceil(timeMinutes(visibleSlot.end)! / 60)] : [])
		)
	);
	const proposedOffset = $derived(
		visibleSlot ? (timeMinutes(visibleSlot.start)! / 60 - startHour) * 8 : undefined
	);

	function makeEvent(
		day: DayItem,
		title: string,
		start: string,
		end: string,
		id: string
	): CalendarGridEvent {
		const course: Course = {
			title,
			prefix: '',
			course_number: 0,
			schedule_type: '',
			term: { uid: 0, season: '', year: 0 },
			professor: { first_name: '', last_name: '', email: '' },
			meeting_times: [
				{
					id,
					begin_time: start,
					end_time: end,
					start_date: dates[day.order],
					end_date: dates[day.order],
					monday: day.key === 'monday',
					tuesday: day.key === 'tuesday',
					wednesday: day.key === 'wednesday',
					thursday: day.key === 'thursday',
					friday: day.key === 'friday',
					saturday: false,
					sunday: false,
					location: {
						building: {
							name: '',
							abbreviation: ''
						},
						rooms: []
					}
				}
			]
		};
		return {
			course,
			meeting: course.meeting_times[0],
			startOffset: (timeMinutes(start)! / 60 - startHour) * 8,
			width: ((timeMinutes(end)! - timeMinutes(start)!) / 60) * 8,
			bgColor: '#616161',
			textColor: '#ffffff',
			stackIndex: 0,
			overlapCount: 1
		};
	}

	function ownerColor(id: string): string {
		const palette = ['#8e24aa', '#0b8043', '#e67c73', '#3f51b5', '#f4511e', '#00897b'];
		const hash = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
		return palette[hash % palette.length];
	}

	function eventsForDay(day: DayItem): CalendarGridEvent[] {
		const date = dates[day.order];
		const events = visiblePeople
			.filter((person) => person.id !== 'you')
			.flatMap((person) =>
				(friendSchedules[person.id] ?? []).flatMap((course) =>
					(course.meeting_times ?? [])
						.filter(
							(meeting) =>
								meeting[day.key] &&
								(!meeting.start_date || meeting.start_date.slice(0, 10) <= date) &&
								(!meeting.end_date || meeting.end_date.slice(0, 10) >= date)
						)
						.map((meeting) => ({
							course,
							meeting,
							ownerId: person.id,
							ownerLabel: person.name,
							startOffset: (timeMinutes(meeting.begin_time)! / 60 - startHour) * 8,
							width: ((timeMinutes(meeting.end_time)! - timeMinutes(meeting.begin_time)!) / 60) * 8,
							bgColor: ownerColor(person.id),
							textColor: '#ffffff',
							stackIndex: 0,
							overlapCount: 1
						}))
				)
			);
		if (visiblePeople.some((person) => person.id === 'you'))
			events.push(
				...(ownEvents?.byDay[day.key] ?? []).map((item) => ({
					...item,
					ownerId: 'you',
					ownerLabel: 'You',
					startOffset: (timeMinutes(item.meeting.begin_time)! / 60 - startHour) * 8,
					stackIndex: 0,
					overlapCount: 1
				}))
			);
		return events;
	}

	function positionEvents(events: CalendarGridEvent[]) {
		const sorted = events.toSorted((a, b) => a.startOffset - b.startOffset);
		let cluster: CalendarGridEvent[] = [];
		let clusterEnd = -Infinity;
		let laneEnds: number[] = [];
		function finishCluster() {
			for (const item of cluster) item.overlapCount = laneEnds.length;
		}
		for (const item of sorted) {
			if (item.startOffset >= clusterEnd) {
				finishCluster();
				cluster = [];
				laneEnds = [];
			}
			let lane = laneEnds.findIndex((end) => end <= item.startOffset);
			if (lane < 0) lane = laneEnds.length;
			laneEnds[lane] = item.startOffset + item.width;
			item.stackIndex = lane;
			cluster.push(item);
			clusterEnd = Math.max(...laneEnds);
		}
		finishCluster();
		return sorted;
	}

	const stackedMeetings = $derived.by(() => {
		const byDay: Record<string, CalendarGridEvent[]> = {};
		for (const day of days) {
			let events = eventsForDay(day);
			if (comparison && mode === 'group') {
				events = mergeBusy(
					events.map((item) => ({
						start: timeMinutes(item.meeting.begin_time)!,
						end: timeMinutes(item.meeting.end_time)!
					}))
				).map((period) =>
					makeEvent(
						day,
						'Group · Busy',
						minutesTime(period.start),
						minutesTime(period.end),
						'group-' + dates[day.order] + '-' + period.start
					)
				);
			}
			if (visibleSlot && dates[day.order] === visibleSlot.date) {
				const entry = makeEvent(
					day,
					'Planned meeting',
					visibleSlot.start,
					visibleSlot.end,
					'proposed-meeting'
				);
				entry.preview = true;
				entry.bgColor = 'rgb(var(--m3-scheme-primary-container))';
				entry.textColor = 'rgb(var(--m3-scheme-on-primary-container))';
				events.push(entry);
			}
			byDay[day.key] = positionEvents(events);
		}
		return { byDay };
	});
	$effect(() => {
		if (detail && !dates.includes(detail.date)) detail = undefined;
	});
	const busyDetails = $derived(
		detail
			? eventsForDay(detail.day).filter(
					(item) =>
						item.startOffset < detail!.item.startOffset + detail!.item.width &&
						item.startOffset + item.width > detail!.item.startOffset
				)
			: []
	);
</script>

<section class="min-w-0 gap-4 grid" aria-label="Calendar comparison">
	<div class="gap-3 flex flex-wrap items-center justify-between">
		<div>
			<h2>{comparison ? `Compare schedules (${participants.length} people)` : 'Your week'}</h2>
		</div>
		{#if comparison}<Button variant="text" onclick={onexit}>Exit comparison</Button>{/if}
	</div>
	<WeekNavigation bind:week />
	{#if comparison}<ConnectedButtons>
			<input
				type="radio"
				name="preview-display"
				id="preview-detailed"
				checked={mode === 'detailed'}
				onchange={() => (ui.comparisonDisplay = 'detailed')}
			/><Button for="preview-detailed">Detailed</Button>
			<input
				type="radio"
				name="preview-display"
				id="preview-group"
				checked={mode === 'group'}
				onchange={() => (ui.comparisonDisplay = 'group')}
			/><Button for="preview-group">Group availability</Button>
		</ConnectedButtons>{/if}
	{#if upcomingSlot}
		<div
			class="gap-3 rounded-xl border-primary bg-primary-container p-3 text-on-primary-container flex items-center border-2 border-dashed"
		>
			<svg aria-hidden="true" class="h-6 w-6 shrink-0" viewBox="0 0 24 24"
				><path
					fill="currentColor"
					d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V9h14z"
				/></svg
			>
			<div class="min-w-0 flex-1">
				<h3>Planned meeting</h3>
				<p class="text-sm">
					{upcomingSlot.day} · {formatTime(upcomingSlot.start, militaryTime)}–{formatTime(
						upcomingSlot.end,
						militaryTime
					)}
				</p>
				{#if !visibleSlot}<Button
						variant="text"
						onclick={() => {
							week = weekDates(upcomingSlot!.date)[0];
						}}>View meeting week</Button
					>{/if}
			</div>
			<div class="ml-auto shrink-0">
				<Button variant="tonal" onclick={onedit}>Edit / confirm</Button>
			</div>
		</div>
	{/if}
	<CalendarGrid
		{stackedMeetings}
		{militaryTime}
		{startHour}
		{latestHour}
		dayOrder={days}
		{dates}
		earliestClassOffsetRem={0}
		focusOffsetRem={proposedOffset}
		onselect={(item, day) => {
			if (item.preview) onedit();
			else if (onownselect && item.ownerId === 'you') onownselect(item, day);
			else detail = { item, day, date: dates[day.order] };
		}}
	/>
	{#if detail}
		<PreviewDialog
			open
			title={String(detail.item.meeting.id).startsWith('group-')
				? 'Group availability'
				: detail.item.course.title}
			onclose={() => (detail = undefined)}
		>
			<div class="gap-4 grid">
				{#if detail.item.ownerLabel}<p class="text-sm font-medium">{detail.item.ownerLabel}</p>{/if}
				<p class="text-sm text-on-surface-variant">
					{dateLabel(detail.date)} · {formatTime(
						detail.item.meeting.begin_time,
						militaryTime
					)}–{formatTime(detail.item.meeting.end_time, militaryTime)}
				</p>
				{#if detail.item.preview}<p class="text-sm">
						{participants.map((person) => person.name).join(', ')}
					</p>
				{:else if String(detail.item.meeting.id).startsWith('group-')}
					<ul class="gap-3 text-sm grid">
						{#each busyDetails as item (`${item.ownerId}:${item.meeting.id}`)}<li>
								<p>{item.ownerLabel} · {item.course.title}</p>
								<p class="text-xs text-on-surface-variant">
									{formatTime(item.meeting.begin_time, militaryTime)}–{formatTime(
										item.meeting.end_time,
										militaryTime
									)}
								</p>
							</li>{/each}
					</ul>
				{:else if detail.item.course.prefix}
					<dl class="gap-x-4 gap-y-2 text-sm grid grid-cols-[auto_1fr]">
						<dt class="text-on-surface-variant">Course</dt>
						<dd>
							{detail.item.course.prefix}
							{detail.item.course.course_number} · {detail.item.course.schedule_type}
						</dd>
						<dt class="text-on-surface-variant">Location</dt>
						<dd>{detail.item.meeting.location?.building?.name}</dd>
						<dt class="text-on-surface-variant">Instructor</dt>
						<dd>
							{[detail.item.course.professor?.first_name, detail.item.course.professor?.last_name]
								.filter(Boolean)
								.join(' ')}
						</dd>
					</dl>
				{/if}
			</div>
		</PreviewDialog>
	{/if}
</section>
