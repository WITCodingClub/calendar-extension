<script lang="ts">
	import { CALENDAR_ICON } from '$lib/icons';
	import { Button, ConnectedButtons } from 'm3-svelte';
	import { untrack } from 'svelte';
	import { dayFlags, DAYS } from '$lib/calendar/days';
	import { positionEvents, syntheticCourse, type CalendarGridEvent } from '$lib/calendar/layout';
	import {
		dateLabel,
		formatTime,
		minutesTime,
		timeMinutes,
		todayDate,
		weekDates
	} from '$lib/datetime';
	import { availabilityMessage, mergeBusy } from '$lib/friends/availability';
	import { busyEndMinutes, busyForRange } from '$lib/friends/schedule';
	import type { Participant, PreviewSlot } from '$lib/friends/types';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import type { Course, DayItem } from '$lib/types';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import PreviewDialog from '$lib/components/ui/PreviewDialog.svelte';
	import WeekNavigation from '$lib/components/ui/WeekNavigation.svelte';
	const ui = getPanelUi();
	const endMinutes = (value: string) => busyEndMinutes(value)!;

	let {
		participants,
		comparison,
		slot,
		date,
		week = $bindable(weekDates(date)[0]),
		ownEvents,
		friendSchedules,
		onownselect,
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
	const days = DAYS.slice(0, 5);
	const dates = $derived(weekDates(week));
	const busyMessage = $derived(availabilityMessage(ui, dates[0], dates[4]));
	$effect(() => {
		const from = dates[0];
		const until = dates[4];
		const people = participants.map((person) => `${person.id}:${person.sharing}`).join(',');
		const version = ui.busyVersion;
		if (people) untrack(() => void ui.busyActions?.load(from, until));
		void version;
	});
	const upcomingSlot = $derived(slot && slot.date >= todayDate() ? slot : undefined);
	const visibleSlot = $derived(
		upcomingSlot && dates.includes(upcomingSlot.date) ? upcomingSlot : undefined
	);
	const startHour = $derived(
		Math.min(
			8,
			...visiblePeople.flatMap((person) =>
				(busyForRange(ui.busyBlocks, person.id, dates[0], dates[4])?.busy ?? [])
					.filter((block) => dates.includes(block.date))
					.map((block) => Math.floor(timeMinutes(block.start)! / 60))
			),
			...(visibleSlot ? [Math.floor(timeMinutes(visibleSlot.start)! / 60)] : [])
		)
	);
	const latestHour = $derived(
		Math.max(
			17,
			...visiblePeople.flatMap((person) =>
				(busyForRange(ui.busyBlocks, person.id, dates[0], dates[4])?.busy ?? [])
					.filter((block) => dates.includes(block.date))
					.map((block) => Math.ceil(endMinutes(block.end) / 60))
			),
			...(visibleSlot ? [Math.ceil(endMinutes(visibleSlot.end) / 60)] : [])
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
		const course = syntheticCourse(title, {
			id,
			begin_time: start,
			end_time: end,
			start_date: dates[day.order],
			end_date: dates[day.order],
			...dayFlags(day.key),
			location: { building: { name: '', abbreviation: '' }, rooms: [] }
		});
		return {
			course,
			meeting: course.meeting_times[0],
			startOffset: (timeMinutes(start)! / 60 - startHour) * 8,
			width: ((endMinutes(end) - timeMinutes(start)!) / 60) * 8,
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
			.filter((person) => person.id !== 'you' && person.sharing !== 'Availability only')
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
							width: ((endMinutes(meeting.end_time) - timeMinutes(meeting.begin_time)!) / 60) * 8,
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
		const result: CalendarGridEvent[] = [];
		for (const person of visiblePeople) {
			const blocks =
				busyForRange(ui.busyBlocks, person.id, dates[0], dates[4])?.busy.filter(
					(block) => block.date === date
				) ?? [];
			const detailed = events.filter(
				(item) =>
					item.ownerId === person.id &&
					blocks.some(
						(block) =>
							timeMinutes(block.start)! <= timeMinutes(item.meeting.begin_time)! &&
							endMinutes(block.end) >= endMinutes(item.meeting.end_time)
					)
			);
			result.push(...detailed);
			for (const block of blocks) {
				let cursor = timeMinutes(block.start)!;
				const end = endMinutes(block.end);
				function addBusy(start: number, finish: number) {
					if (finish <= start) return;
					const item = makeEvent(
						day,
						'Busy',
						minutesTime(start),
						minutesTime(finish),
						`busy-${person.id}-${date}-${start}`
					);
					item.ownerId = person.id;
					item.ownerLabel = person.name;
					item.bgColor = ownerColor(person.id);
					result.push(item);
				}
				for (const interval of mergeBusy(
					detailed.map((item) => ({
						start: timeMinutes(item.meeting.begin_time)!,
						end: endMinutes(item.meeting.end_time)
					}))
				)) {
					if (interval.end <= cursor || interval.start >= end) continue;
					addBusy(cursor, interval.start);
					cursor = Math.max(cursor, interval.end);
				}
				addBusy(cursor, end);
			}
		}
		return result;
	}

	const stackedMeetings = $derived.by(() => {
		const byDay: Record<string, CalendarGridEvent[]> = {};
		for (const day of days) {
			let events = eventsForDay(day);
			if (comparison && mode === 'group') {
				events = mergeBusy(
					events.map((item) => ({
						start: timeMinutes(item.meeting.begin_time)!,
						end: endMinutes(item.meeting.end_time)
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
		const people = participants
			.map((person) => `${person.id}:${person.sharing}:${person.expiry}`)
			.join(',');
		if (
			detail &&
			(!dates.includes(detail.date) ||
				busyMessage ||
				!(stackedMeetings.byDay[detail.day.key] ?? []).some(
					(item) =>
						item.ownerId === detail!.item.ownerId &&
						item.meeting.id === detail!.item.meeting.id &&
						item.course.title === detail!.item.course.title
				))
		)
			detail = undefined;
		void people;
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
				><path fill="currentColor" d={CALENDAR_ICON} /></svg
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
	{#if busyMessage}<p class="text-sm text-on-surface-variant" role="status">{busyMessage}</p>
		<Button
			variant="text"
			onclick={async () => {
				await ui.friendActions?.retrySchedules();
				await ui.busyActions?.load(dates[0], dates[4]);
			}}>Reload schedules</Button
		>
	{:else}<CalendarGrid
			{stackedMeetings}
			{militaryTime}
			{startHour}
			{latestHour}
			{dates}
			earliestClassOffsetRem={0}
			focusOffsetRem={proposedOffset}
			onselect={(item, day) => {
				if (item.preview) onedit();
				else if (
					onownselect &&
					item.ownerId === 'you' &&
					!String(item.meeting.id).startsWith('busy-')
				)
					onownselect(item, day);
				else detail = { item, day, date: dates[day.order] };
			}}
		/>{/if}
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
