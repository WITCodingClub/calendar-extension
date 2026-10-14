<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from 'm3-svelte';
	import { processedData, termClasses, userSettings } from '$lib/stores';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { scheduleAvailability } from '$lib/friends/availability';
	import { validDate } from '$lib/friends/schedule';
	import { todayDate, CAMPUS_TIME_ZONE, shiftDate, weekDates } from '$lib/datetime';
	import {
		editorMessage,
		suggestedMeetings,
		openMeetingDraft,
		continueMeetingDraft,
		draftSummary
	} from '$lib/friends/planner';
	import FriendsComposition from './FriendsComposition.svelte';
	import type { PlannerSlot } from '$lib/friends/types';
	import FriendsPlanner from './FriendsPlanner.svelte';
	import MeetingLinks from './MeetingLinks.svelte';
	import SavedMeetings from './SavedMeetings.svelte';
	const ui = getPanelUi();
	const session = getPanelSession();
	let linkManager: MeetingLinks | undefined = $state();
	let meetingList: SavedMeetings | undefined = $state();
	let refreshing = $state(false);
	let settling = false;
	const settledScopes = new SvelteSet<string>();
	const militaryTime = $derived($userSettings?.military_time ?? true);
	const ownCourses = $derived(termClasses($processedData, ui.currentTerm));
	const availability = $derived(scheduleAvailability(ui, ownCourses));
	const suggestions = $derived(
		suggestedMeetings(availability.periods, Number(ui.preferences.duration))
	);
	const windows = $derived(availability.periods);
	const draft = $derived(draftSummary(ui));
	const currentWeek = $derived(weekDates(todayDate(CAMPUS_TIME_ZONE))[0]);
	const presets = $derived([
		{ id: 'this-week', label: 'This week', from: currentWeek, until: shiftDate(currentWeek, 4) },
		{
			id: 'next-week',
			label: 'Next week',
			from: shiftDate(currentWeek, 7),
			until: shiftDate(currentWeek, 11)
		},
		{ id: 'dates', label: 'Custom Date' }
	]);
	const busy = $derived(
		Boolean(
			ui.actionLoadingId ||
				ui.groupLoadingId ||
				ui.meetingDraft?.submitting ||
				ui.savedMeetingBusy ||
				ui.linkBusy ||
				linkManager?.isBusy() ||
				meetingList?.isBusy()
		)
	);

	function compare() {
		ui.friendsReturnTarget = document.activeElement as HTMLElement;
		ui.friendsScroll = window.scrollY;
		ui.term = ui.currentTerm ?? ui.term;
		ui.comparison = true;
		void goto(resolve('/calendar'), { noScroll: true });
	}
	function choose(slot: PlannerSlot) {
		const period = availability.periods.find(
			(period) => period.date === slot.date && period.start <= slot.start && period.end >= slot.end
		);
		if (period) openMeetingDraft(ui, period, slot.start, slot.end - slot.start);
	}
	async function refresh() {
		if (refreshing || busy || !session.active) return;
		refreshing = true;
		try {
			await ui.friendActions?.refresh();
			if (ui.featuresError) await ui.featureActions?.reload();
			if (!session.active) return;
			await Promise.all([linkManager?.reload(), meetingList?.refresh()]);
			if (ui.comparison) await ui.busyActions?.load(ui.week, shiftDate(ui.week, 4));
		} finally {
			refreshing = false;
		}
	}
	async function settle() {
		const base = { ...ui.preferences };
		const scope = JSON.stringify({ base, selected: ui.selected, term: ui.currentTerm });
		if (settling || settledScopes.has(scope)) return;
		settledScopes.add(scope);
		settling = true;
		const selection = ui.selected.join(',');
		const current = () =>
			session.active &&
			!ui.filtersManual &&
			selection === ui.selected.join(',') &&
			JSON.stringify(base) === JSON.stringify(ui.preferences);
		try {
			let candidate = { ...base };
			const candidates = [];
			if (Number(candidate.duration) > 15) candidate = { ...candidate, duration: '15' };
			candidates.push({ ...candidate });
			candidate = { ...candidate, betweenClasses: false };
			candidates.push({ ...candidate });
			candidate = { ...candidate, buffer: '0' };
			candidates.push({ ...candidate });
			candidate = { ...candidate, dailyStart: '08:00', dailyEnd: '21:00' };
			candidates.push({ ...candidate });
			const other = presets.find((preset) => preset.from && preset.id !== base.preset);
			if (other?.from && other.until)
				candidates.push({ ...candidate, preset: other.id, from: other.from, until: other.until });
			for (const preference of candidates) {
				if (!current()) return;
				await ui.busyActions?.load(preference.from, preference.until);
				if (!current()) return;
				const result = scheduleAvailability(ui, ownCourses, preference);
				if (
					!result.message &&
					suggestedMeetings(result.periods, Number(preference.duration)).length
				) {
					ui.preferences = preference;
					return;
				}
			}
		} finally {
			settling = false;
		}
	}
	$effect(() => {
		if (
			ui.planning &&
			!ui.filtersManual &&
			ui.hasSelectedFriends &&
			!availability.message &&
			!suggestions.length
		)
			untrack(() => void settle());
	});
	$effect(() => {
		const date = ui.savedDraft?.slot.date;
		const selected = ui.selected.join(',');
		const version = ui.busyVersion;
		if (date && selected && validDate(date)) untrack(() => void ui.busyActions?.load(date, date));
		void version;
	});
</script>

{#if ui.featuresError}<div class="gap-2 flex items-center justify-between">
		<p class="text-sm text-error" role="alert">
			Could not load meeting availability: {ui.featuresError}
		</p>
		<Button
			variant="text"
			disabled={ui.featuresLoading}
			onclick={() => void ui.featureActions?.reload()}>Retry meeting availability</Button
		>
	</div>{/if}
<FriendsComposition>
	{#snippet planner()}
		<FriendsPlanner
			oncompare={compare}
			onrefresh={() => void refresh()}
			{refreshing}
			{busy}
			people={ui.people}
			groups={ui.groups}
			bind:selected={ui.selected}
			bind:preferences={ui.preferences}
			{presets}
			{suggestions}
			{windows}
			{draft}
			draftConflict={Boolean(ui.savedDraft && editorMessage(ui, ownCourses, ui.savedDraft.slot))}
			{militaryTime}
			loading={ui.friendsLoading}
			loadError={ui.friendsError}
			resultMessage={availability.message ?? ''}
			disabled={Boolean(ui.meetingDraft?.submission || ui.meetingDraft?.submitting)}
			onfilters={() => (ui.filtersManual = true)}
			onpeople={() => (ui.filtersManual = true)}
			onchoose={choose}
			oncontinue={() => continueMeetingDraft(ui)}
			ondiscard={() => {
				if (!ui.meetingDraft?.submission) ui.savedDraft = undefined;
			}}
			onaddfriends={() => (ui.manageOpen = true)}
			onretry={() => void ui.friendActions?.refresh()}
		/>
	{/snippet}
	{#snippet links()}
		{#if ui.meetingLinksEnabled}<MeetingLinks bind:this={linkManager} />
		{:else if !ui.featuresLoading && !ui.featuresError}<p class="text-sm text-on-surface-variant">
				Meeting links are not enabled for this account.
			</p>{/if}
	{/snippet}
	{#snippet meetings()}
		{#if ui.meetingEventsEnabled}<SavedMeetings
				bind:this={meetingList}
				week={ui.week}
				{militaryTime}
			/>
		{:else if !ui.featuresLoading && !ui.featuresError}<p class="text-sm text-on-surface-variant">
				Saved meetings are not enabled for this account.
			</p>{/if}
	{/snippet}
</FriendsComposition>
