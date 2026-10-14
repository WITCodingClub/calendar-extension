<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { processedData, termClasses } from '$lib/stores';
	import { weekDates, timeMinutes } from '$lib/datetime';
	import { busyEndMinutes, validDate } from '$lib/friends/schedule';
	import { copyDraft, editorMessage } from '$lib/friends/planner';
	import { comparisonPeople } from '$lib/friends/comparisonData';
	import type { SavedMeetingsResponse } from '$lib/friends/savedMeetings';
	import type { CalendarGridEvent } from '$lib/calendar/layout';
	import type { DayItem } from '$lib/types';
	import { DAYS } from '$lib/calendar/days';
	import ComparisonView from './ComparisonView.svelte';
	let {
		militaryTime,
		savedMeetings = { meetings: [], occurrences: [] },
		onownselect
	}: {
		militaryTime: boolean;
		savedMeetings?: SavedMeetingsResponse;
		onownselect?: (item: CalendarGridEvent, day: DayItem) => void;
	} = $props();
	const ui = getPanelUi();
	const ownCourses = $derived(termClasses($processedData, ui.scheduleTerm) ?? []);
	const people = $derived(comparisonPeople(ui, ownCourses, savedMeetings));
	const activeDraft = $derived(ui.highlightedSlot ? ui.meetingDraft : ui.savedDraft);
	const proposalMessage = $derived(
		activeDraft ? editorMessage(ui, ownCourses, activeDraft.slot) : undefined
	);
	const proposal = $derived(
		activeDraft && validDate(activeDraft.slot.date)
			? {
					title: activeDraft.title,
					date: activeDraft.slot.date,
					start: timeMinutes(activeDraft.slot.start) ?? 0,
					end: busyEndMinutes(activeDraft.slot.end) ?? 0,
					saved: !ui.highlightedSlot,
					invite: activeDraft.inviteFriends,
					canConfirm: Boolean(
						ui.highlightedSlot &&
							activeDraft.title.trim() &&
							ui.meetingEventsEnabled &&
							!proposalMessage
					),
					message: proposalMessage
				}
			: undefined
	);
	$effect(() => {
		const dates = weekDates(ui.week);
		const ids = ui.selected.join(',');
		const version = ui.busyVersion;
		if (ids) untrack(() => void ui.busyActions?.load(dates[0], dates[4]));
		void version;
	});
	$effect(() => {
		const date = activeDraft?.slot.date;
		const ids = ui.selected.join(',');
		const version = ui.busyVersion;
		if (date && ids && validDate(date)) untrack(() => void ui.busyActions?.load(date, date));
		void version;
	});
	function returnToFriends() {
		ui.meetingEditorOpen = false;
		ui.comparison = false;
		void goto(resolve('/friends'), { noScroll: true });
	}
</script>

<ComparisonView
	{people}
	bind:week={ui.week}
	bind:mode={ui.comparisonDisplay}
	bind:presentation={ui.comparisonPresentation}
	bind:selectedDay={ui.comparisonDay}
	currentWeek={weekDates()[0]}
	{militaryTime}
	{proposal}
	{savedMeetings}
	onmeeting={(meeting, occurrence) => (ui.savedMeetingDetail = { meeting, occurrence })}
	onreturn={returnToFriends}
	onretry={() => void ui.friendActions?.retrySchedules()}
	onedit={() => {
		if (!ui.highlightedSlot && ui.savedDraft && !ui.meetingDraft?.submission)
			ui.meetingDraft = copyDraft(ui.savedDraft);
		ui.meetingActions?.edit();
	}}
	onconfirm={() => ui.meetingActions?.review()}
	onclass={(block, date) => {
		if (block.course && block.meeting)
			onownselect?.(
				{
					course: block.course,
					meeting: block.meeting,
					startOffset: 0,
					width: 0,
					bgColor: '',
					textColor: '',
					stackIndex: 0,
					overlapCount: 1
				},
				DAYS[Math.max(0, weekDates(ui.week).indexOf(date))]
			);
	}}
/>
