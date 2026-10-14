<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { API, ApiError } from '$lib/api';
	import {
		providerLabel,
		type CalendarDestination,
		type SavedMeetingInput
	} from '$lib/friends/savedMeetings';
	import type { MeetingDraft } from '$lib/friends/types';
	import { processedData, termClasses, userSettings } from '$lib/stores';
	import {
		calendarDateTime,
		dateLabel,
		formatTime,
		todayDate,
		CAMPUS_TIME_ZONE,
		minutesTime,
		shiftDate,
		timeMinutes,
		weekDates
	} from '$lib/datetime';
	import { scheduleAvailability } from '$lib/friends/availability';
	import { copyDraft, editorMessage, suggestedMeetings } from '$lib/friends/planner';
	import { busyEndMinutes, busyForRange, validDate } from '$lib/friends/schedule';
	import CreateMeetingEditor from './CreateMeetingEditor.svelte';
	import { Button, Dialog, snackbar } from 'm3-svelte';
	import { untrack, tick } from 'svelte';

	const ui = getPanelUi();
	const session = getPanelSession();
	let availableDestinations = $state<CalendarDestination[]>(['ics']);
	let accountsLoading = $state(false);
	let accountsError = $state('');
	const submitting = $derived(ui.meetingDraft?.submitting ?? false);
	let destinationVersion = 0;
	let confirmOpen = $state(false);
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
	const ownCourses = $derived(termClasses($processedData, ui.scheduleTerm));

	async function loadDestinations() {
		const draft = ui.meetingDraft as
			| (MeetingDraft & { destinationDefaultsPending?: boolean })
			| undefined;
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
			) as CalendarDestination[];
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
			if (session.active && version === destinationVersion) {
				accountsLoading = false;
				if (
					!accountsError &&
					ui.meetingEditorOpen &&
					ui.meetingDraft === draft &&
					draft &&
					!draft.submission
				) {
					if (draft.destinationDefaultsPending) {
						draft.destinations = availableDestinations.includes('google') ? ['google'] : ['ics'];
						draft.destinationDefaultsPending = false;
					} else {
						const destinations = draft.destinations.filter((provider) =>
							availableDestinations.includes(provider)
						);
						if (destinations.length !== draft.destinations.length)
							draft.destinations = destinations.length ? destinations : ['ics'];
					}
				}
			}
		}
	}

	async function create() {
		const draft = ui.meetingDraft;
		if (!draft || submitting || !session.active) return;
		try {
			if (!draft.submission) {
				const error = editorMessage(ui, ownCourses, draft.slot);
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
				const end = busyEndMinutes(draft.slot.end)!;
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
			ui.savedDraft = undefined;
			confirmOpen = false;
			snackbar('Meeting created.');
			void goto(resolve('/calendar'));
		} catch (failure) {
			if (failure instanceof ApiError && failure.status === 422) draft.submission = undefined;
			if (session.active)
				draft.error = `${failure instanceof Error ? failure.message : 'Could not create the meeting.'}${draft.submission ? ' Retry to confirm this meeting; its details are kept to avoid duplicates.' : ''}`;
		} finally {
			draft.submitting = false;
		}
	}
	const message = $derived(
		ui.meetingDraft ? editorMessage(ui, ownCourses, ui.meetingDraft.slot) : undefined
	);
	function preview() {
		const draft = ui.meetingDraft;
		if (!draft || submitting || draft.submission) return;
		const error = editorMessage(ui, ownCourses, draft.slot);
		if (error) {
			snackbar(error, undefined, true);
			return;
		}
		const start = timeMinutes(draft.slot.start)!;
		const end = busyEndMinutes(draft.slot.end)!;
		const slot = {
			...draft.slot,
			id: `${draft.slot.date}-${start}-${end}`,
			day: dateLabel(draft.slot.date),
			start: minutesTime(start),
			end: minutesTime(end)
		};
		draft.slot = slot;
		ui.highlightedSlot = { ...slot };
		ui.week = weekDates(slot.date)[0];
		ui.term = ui.scheduleTerm ?? ui.term;
		ui.comparison = true;
		ui.comparisonDisplay = 'detailed';
		ui.comparisonPresentation = 'list';
		ui.comparisonDay = slot.date;
		if (ui.planning) ui.friendsScroll = window.scrollY;
		ui.friendsReturnTarget ??= ui.editorReturnTarget;
		ui.meetingEditorOpen = false;
		void goto(resolve('/calendar'));
	}

	const draft = $derived(ui.meetingDraft);
	const start = $derived(draft ? (timeMinutes(draft.slot.start) ?? 0) : 0);
	const duration = $derived(draft ? (busyEndMinutes(draft.slot.end) ?? 0) - start : 30);
	const editorParticipants = $derived(
		participants.map((person) => {
			const data =
				draft && validDate(draft.slot.date)
					? busyForRange(ui.busyBlocks, person.id, draft.slot.date, draft.slot.date)
					: undefined;
			return {
				id: person.id,
				name: person.name,
				busy: (data?.busy ?? [])
					.filter((block) => block.date === draft?.slot.date)
					.map((block) => [timeMinutes(block.start)!, busyEndMinutes(block.end)!]),
				message: data ? undefined : 'Availability unavailable'
			};
		})
	);
	const rangeStart = $derived(timeMinutes(ui.preferences.dailyStart) ?? 8 * 60);
	const rangeEnd = $derived(
		(busyEndMinutes(ui.preferences.dailyEnd) ?? 21 * 60) > rangeStart
			? busyEndMinutes(ui.preferences.dailyEnd)!
			: Math.min(1440, rangeStart + 60)
	);
	const editorAvailability = $derived(
		draft && validDate(draft.slot.date)
			? scheduleAvailability(ui, ownCourses, {
					...ui.preferences,
					from: draft.slot.date,
					until: draft.slot.date,
					duration: String(duration)
				})
			: { periods: [], message: 'Choose a valid date.' }
	);
	const starts = $derived(
		[
			...new Set([
				...suggestedMeetings(editorAvailability.periods, duration).map((slot) => slot.start),
				start
			])
		]
			.sort((a, b) => a - b)
			.map((value) => ({
				value: String(value),
				text: formatTime(minutesTime(value), militaryTime),
				disabled: !editorAvailability.periods.some(
					(period) => value >= period.start && value + duration <= period.end
				)
			}))
	);
	const calendarOptions = $derived(
		availableDestinations.map((value) => ({ value, text: providerLabel(value) }))
	);
	const validation = $derived(
		message ||
			accountsError ||
			(!ui.hasSelectedFriends ? 'Choose at least one friend.' : '') ||
			(!ui.meetingEventsEnabled ? 'Meeting creation is not enabled for this account.' : '') ||
			(accountsLoading ? 'Loading destination calendars…' : '')
	);
	const canCreate = $derived(
		Boolean(
			draft &&
				!submitting &&
				ui.meetingEventsEnabled &&
				(draft.submission ||
					(!validation &&
						draft.title.trim() &&
						draft.title.trim().length <= 200 &&
						draft.location.trim().length <= 200 &&
						draft.destinations.length &&
						draft.destinations.every((provider) => availableDestinations.includes(provider))))
		)
	);
	function changeSlot(date: string, beginning = start, length = duration) {
		if (!draft || draft.submission || submitting) return;
		draft.slot = {
			...draft.slot,
			date,
			day: validDate(date) ? dateLabel(date) : '',
			start: minutesTime(beginning),
			end: minutesTime(beginning + length)
		};
		draft.error = '';
	}
	async function restoreFocus() {
		await tick();
		if (ui.editorReturnTarget?.isConnected && !ui.editorReturnTarget.closest('[hidden]'))
			ui.editorReturnTarget.focus();
	}
	function discard() {
		if (!draft || draft.submission || submitting) return;
		ui.meetingEditorOpen = false;
		ui.meetingDraft = undefined;
		ui.highlightedSlot = undefined;
		void restoreFocus();
	}
	function saveDraft() {
		if (!draft || draft.submission || submitting) return;
		ui.savedDraft = copyDraft(draft);
		ui.meetingEditorOpen = false;
		ui.meetingDraft = undefined;
		ui.highlightedSlot = undefined;
		void restoreFocus();
	}
	function review() {
		if (!draft || submitting) return;
		if (!canCreate) {
			draft.error = validation || 'Enter a title and choose an available calendar.';
			ui.meetingEditorOpen = true;
			return;
		}
		confirmOpen = true;
	}
	async function retry() {
		if (submitting || draft?.submission) return;
		await Promise.all([loadDestinations(), ui.friendActions?.retrySchedules()]);
		if (draft && validDate(draft.slot.date))
			await ui.busyActions?.load(draft.slot.date, draft.slot.date);
	}
	ui.meetingActions = { review, edit: () => (ui.meetingEditorOpen = true) };
</script>

{#if ui.meetingDraft?.submission && !ui.meetingEditorOpen}
	<Button variant="text" disabled={submitting} onclick={() => (ui.meetingEditorOpen = true)}
		>Retry meeting creation</Button
	>
{/if}

{#if draft && ui.meetingEditorOpen}
	<CreateMeetingEditor
		bind:open={
			() => ui.meetingEditorOpen,
			(value) => {
				if (value) ui.meetingEditorOpen = true;
				else discard();
			}
		}
		bind:title={() => draft!.title, (value) => (draft!.title = value)}
		bind:location={() => draft!.location, (value) => (draft!.location = value)}
		bind:date={() => draft!.slot.date, (value) => changeSlot(value)}
		bind:start={() => String(start), (value) => changeSlot(draft!.slot.date, Number(value))}
		bind:duration={
			() => String(duration), (value) => changeSlot(draft!.slot.date, start, Number(value))
		}
		bind:frequency={
			() => draft!.frequency,
			(value) => {
				if (value === 'one_time' || value === 'weekly') draft!.frequency = value;
			}
		}
		bind:calendar={
			() => draft!.destinations[0] ?? '',
			(value) => {
				if (availableDestinations.includes(value as CalendarDestination))
					draft!.destinations = [value as CalendarDestination];
			}
		}
		bind:invite={() => draft!.inviteFriends, (value) => (draft!.inviteFriends = value)}
		participants={editorParticipants}
		buffer={Number(ui.preferences.buffer) || 0}
		{rangeStart}
		{rangeEnd}
		{militaryTime}
		{starts}
		{calendarOptions}
		{canCreate}
		locked={Boolean(draft.submission)}
		{submitting}
		createLabel={submitting ? 'Creating…' : draft.submission ? 'Retry creation' : undefined}
		canPreview={!message && !submitting && !draft.submission && ui.hasSelectedFriends}
		onpreview={preview}
		message={draft.error || validation}
		onretry={!draft.submission && (message || accountsError) ? () => void retry() : undefined}
		minDate={validDate(ui.preferences.from) && ui.preferences.from > todayDate(CAMPUS_TIME_ZONE)
			? ui.preferences.from
			: todayDate(CAMPUS_TIME_ZONE)}
		maxDate={validDate(ui.preferences.until) ? ui.preferences.until : undefined}
		onsavedraft={saveDraft}
		ondiscard={discard}
		oncreate={review}
	/>
{/if}

<div class="meeting-confirmation friends-preview">
	<Dialog
		bind:open={confirmOpen}
		headline="Create this meeting?"
		role="dialog"
		aria-label="Confirm meeting"
		closedby={submitting ? 'none' : 'closerequest'}
	>
		{#snippet buttons()}
			<div class="confirmation-actions">
				<Button
					variant="text"
					disabled={submitting}
					onclick={() => {
						confirmOpen = false;
						ui.meetingEditorOpen = true;
					}}>Back to editing</Button
				>
				<Button disabled={!canCreate} onclick={() => void create()}
					>{submitting
						? 'Creating…'
						: draft?.submission
							? 'Retry creation'
							: draft?.inviteFriends
								? 'Create & invite'
								: 'Create meeting'}</Button
				>
			</div>
		{/snippet}
		{#if draft}
			<div class="confirmation-summary">
				<h2 class="m3-font-title-large">{draft.title || 'Untitled meeting'}</h2>
				<p>
					{dateLabel(draft.slot.date)} · {formatTime(draft.slot.start, militaryTime)} - {formatTime(
						draft.slot.end,
						militaryTime
					)}
				</p>
				<p>{participants.map((person) => person.name).join(', ')}</p>
				{#if draft.location}<p>{draft.location}</p>{/if}
				<p class="m3-font-body-small">
					{draft.destinations.map(providerLabel).join(', ')} - {draft.frequency === 'weekly'
						? 'Weekly through the term'
						: 'Once'} - Invites {draft.inviteFriends ? 'on' : 'off'}
				</p>
				{#if draft.error || validation}<p class="text-error" role="alert">
						{draft.error || validation}
					</p>{/if}
			</div>
		{/if}
	</Dialog>
</div>

<style>
	.meeting-confirmation :global(dialog) {
		width: min(35rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: calc(100dvh - 2rem);
		overflow: hidden;
	}
	.meeting-confirmation :global(.content) {
		overflow-y: auto;
		min-height: 0;
	}
	.confirmation-summary {
		display: grid;
		gap: 1rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.confirmation-summary p,
	.confirmation-summary h2 {
		margin: 0;
	}
	.confirmation-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
