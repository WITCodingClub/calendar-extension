<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { processedData, userSettings } from '$lib/store';
	import { dateLabel, weekDates } from '$lib/calendarDates';
	import { meetingMessage, minutesTime, timeMinutes } from './availability';
	import FreePeriodResult from './FreePeriodResult.svelte';
	import MeetingEventForm from './MeetingEventForm.svelte';
	import PreviewDialog from './PreviewDialog.svelte';
	import { snackbar } from 'm3-svelte';
	import { untrack } from 'svelte';

	const ui = getPanelUi();
	$effect(() => {
		const date = ui.meetingDraft?.slot.date;
		const ids = ui.selected.join(',');
		const version = ui.busyVersion;
		if (ui.meetingEditorOpen && date && ids) untrack(() => void ui.busyActions?.load(date, date));
		void version;
	});
	const militaryTime = $derived($userSettings?.military_time ?? true);
	const participants = $derived(ui.people.filter((person) => ui.selected.includes(person.id)));
	const ownCourses = $derived(
		$processedData.find((item) => String(item.termId) === ui.scheduleTerm)?.responseData.classes
	);
	const message = $derived(
		ui.meetingDraft ? meetingMessage(ui, ownCourses, ui.meetingDraft.slot) : undefined
	);
	const windowAvailable = $derived(
		ui.meetingDraft &&
			!meetingMessage(ui, ownCourses, {
				...ui.meetingDraft.slot,
				date: ui.meetingDraft.period.date,
				start: minutesTime(ui.meetingDraft.period.start),
				end: minutesTime(ui.meetingDraft.period.end)
			})
	);

	function preview() {
		const draft = ui.meetingDraft;
		if (!draft) return;
		const error = meetingMessage(ui, ownCourses, draft.slot);
		if (error) {
			snackbar(error, undefined, true);
			return;
		}
		const start = timeMinutes(draft.slot.start)!;
		const end = timeMinutes(draft.slot.end)!;
		const slot = {
			...draft.slot,
			id: `${draft.slot.date}-${start}-${end}`,
			day: dateLabel(draft.slot.date),
			start: minutesTime(start),
			end: minutesTime(end)
		};
		draft.slot = slot;
		ui.starts[draft.period.id] = start;
		ui.highlightedSlot = { ...slot };
		ui.week = weekDates(slot.date)[0];
		ui.term = ui.scheduleTerm ?? ui.term;
		ui.comparison = true;
		ui.meetingEditorOpen = false;
		void goto(resolve('/calendar'));
	}
</script>

{#if ui.meetingDraft && ui.meetingEditorOpen}
	<PreviewDialog
		bind:open={ui.meetingEditorOpen}
		title={ui.meetingDetails ? 'Edit / confirm meeting' : 'Choose meeting time'}
	>
		{#if ui.meetingDetails}
			<MeetingEventForm
				slot={ui.meetingDraft.slot}
				bind:title={ui.meetingDraft.title}
				bind:location={ui.meetingDraft.location}
				{participants}
				{militaryTime}
				{message}
				onback={() => (ui.meetingDetails = false)}
				onview={preview}
			/>
		{:else}
			<FreePeriodResult
				period={ui.meetingDraft.period}
				bounds={ui.scheduleTerm ? ui.termBounds[ui.scheduleTerm] : undefined}
				bind:slot={ui.meetingDraft.slot}
				{militaryTime}
				{message}
				windowAvailable={Boolean(windowAvailable)}
				onadd={() => {
					const error = meetingMessage(ui, ownCourses, ui.meetingDraft!.slot);
					if (error) snackbar(error, undefined, true);
					else ui.meetingDetails = true;
				}}
				onview={preview}
			/>
		{/if}
	</PreviewDialog>
{/if}
