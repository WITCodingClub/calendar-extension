<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { getPanelSession } from '$lib/panelSession';
	import { API, ApiError } from '$lib/api';
	import type { SavedMeetingInput } from '$lib/savedMeetings';
	import { processedData, userSettings } from '$lib/store';
	import { calendarDateTime, dateLabel, shiftDate, weekDates } from '$lib/calendarDates';
	import { meetingMessage, minutesTime, timeMinutes } from './availability';
	import FreePeriodResult from './FreePeriodResult.svelte';
	import MeetingEventForm from './MeetingEventForm.svelte';
	import PreviewDialog from './PreviewDialog.svelte';
	import { snackbar } from 'm3-svelte';
	import { untrack } from 'svelte';

	const ui = getPanelUi();
	const session = getPanelSession();
	let availableDestinations = $state<Array<'google' | 'microsoft' | 'ics'>>(['ics']);
	let accountsLoading = $state(false);
	let accountsError = $state('');
	const submitting = $derived(ui.meetingDraft?.submitting ?? false);
	let destinationVersion = 0;
	$effect(() => {
		if (ui.meetingEditorOpen) untrack(() => void loadDestinations());
	});
	$effect(() => {
		const date = ui.meetingDraft?.slot.date;
		const ids = ui.selected.join(',');
		const version = ui.busyVersion;
		if (ui.meetingEditorOpen && date && ids) untrack(() => void ui.busyActions?.load(date, date));
		void version;
	});
	const militaryTime = $derived($userSettings?.military_time ?? true);
	const participants = $derived(
		ui.people.filter((person) =>
			ui.meetingDraft?.submission
				? person.id === 'you' || ui.meetingDraft.submission.friend_ids.includes(person.id)
				: ui.selected.includes(person.id)
		)
	);
	const ownCourses = $derived(
		$processedData.find((item) => String(item.termId) === ui.scheduleTerm)?.responseData.classes
	);

	async function loadDestinations() {
		const draft = ui.meetingDraft;
		const version = ++destinationVersion;
		accountsLoading = true;
		accountsError = '';
		try {
			const response = await API.getConnectedAccounts();
			if (
				!session.active ||
				version !== destinationVersion ||
				!ui.meetingEditorOpen ||
				ui.meetingDraft !== draft
			)
				return;
			availableDestinations = ['google', 'microsoft', 'ics'].filter(
				(provider) =>
					provider === 'ics' ||
					response.oauth_credentials.some(
						(account) =>
							account.provider === provider &&
							account.has_calendar === true &&
							!account.needs_reauth &&
							!account.token_revoked
					)
			) as Array<'google' | 'microsoft' | 'ics'>;
			if (ui.meetingDraft && !ui.meetingDraft.submission)
				ui.meetingDraft.destinations = ui.meetingDraft.destinations.filter((provider) =>
					availableDestinations.includes(provider)
				);
		} catch (failure) {
			if (
				session.active &&
				version === destinationVersion &&
				ui.meetingEditorOpen &&
				ui.meetingDraft === draft
			) {
				availableDestinations = ['ics'];
				accountsError =
					failure instanceof Error ? failure.message : 'Could not load connected calendars.';
			}
		} finally {
			if (session.active && version === destinationVersion) accountsLoading = false;
		}
	}

	async function create() {
		const draft = ui.meetingDraft;
		if (!draft || submitting || !session.active) return;
		const retry = Boolean(draft.submission);
		try {
			if (!draft.submission) {
				const error = meetingMessage(ui, ownCourses, draft.slot);
				if (error) throw new Error(error);
				const title = draft.title.trim();
				const location = draft.location.trim();
				if (!title || title.length > 200)
					throw new Error('Enter a meeting title of 200 characters or fewer.');
				if (location.length > 200) throw new Error('Keep the location within 200 characters.');
				const friendIds = [...new Set(ui.selected.filter((id) => id !== 'you'))];
				if (!friendIds.length || friendIds.length > 20)
					throw new Error('Choose between 1 and 20 friends.');
				if (
					accountsLoading ||
					!draft.destinations.length ||
					draft.destinations.some((provider) => !availableDestinations.includes(provider))
				)
					throw new Error('Choose an available destination calendar.');
				const start = timeMinutes(draft.slot.start)!;
				const end = draft.slot.end === '24:00' ? 1440 : timeMinutes(draft.slot.end)!;
				if (end - start > 720) throw new Error('Meetings can last up to 12 hours.');
				const payload: SavedMeetingInput = {
					title,
					location,
					friend_ids: friendIds,
					start_time: calendarDateTime(draft.slot.date, minutesTime(start)),
					end_time: calendarDateTime(
						end === 1440 ? shiftDate(draft.slot.date, 1) : draft.slot.date,
						end === 1440 ? '00:00' : minutesTime(end)
					),
					frequency: draft.frequency,
					invite_friends: draft.inviteFriends,
					destinations: [...draft.destinations]
				};
				draft.submission = payload;
			}
			draft.submitting = true;
			draft.error = '';
			await API.createSavedMeeting(draft.submission, draft.idempotencyKey);
			if (!session.active) return;
			ui.invalidateMeetings(session);
			ui.highlightedSlot = undefined;
			ui.restoredPreview = undefined;
			ui.week = weekDates(draft.slot.date)[0];
			ui.term = ui.scheduleTerm ?? ui.term;
			ui.comparison = true;
			ui.meetingEditorOpen = false;
			ui.meetingDraft = undefined;
			snackbar('Meeting created.');
			void goto(resolve('/calendar'));
		} catch (failure) {
			if (
				!retry &&
				failure instanceof ApiError &&
				[400, 401, 403, 404, 422, 429].includes(failure.status)
			)
				draft.submission = undefined;
			if (session.active)
				draft.error = `${failure instanceof Error ? failure.message : 'Could not create the meeting.'}${draft.submission ? ' Retry to confirm this meeting; its details are kept to avoid duplicates.' : ''}`;
		} finally {
			draft.submitting = false;
		}
	}
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
		if (!draft || submitting || draft.submission) return;
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
		closable={!submitting}
		title={ui.meetingDetails ? 'Edit / confirm meeting' : 'Choose meeting time'}
	>
		{#if ui.meetingDetails}
			<MeetingEventForm
				slot={ui.meetingDraft.slot}
				bind:title={ui.meetingDraft.title}
				bind:location={ui.meetingDraft.location}
				bind:destinations={ui.meetingDraft.destinations}
				bind:inviteFriends={ui.meetingDraft.inviteFriends}
				bind:frequency={ui.meetingDraft.frequency}
				{availableDestinations}
				{accountsLoading}
				{accountsError}
				{submitting}
				attempted={Boolean(ui.meetingDraft.submission)}
				error={ui.meetingDraft.error}
				{participants}
				{militaryTime}
				{message}
				onback={() => (ui.meetingDetails = false)}
				onview={preview}
				oncreate={() => void create()}
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
