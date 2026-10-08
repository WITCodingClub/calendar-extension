<script lang="ts">
	import { Button, TextFieldOutlined } from 'm3-svelte';
	import { API } from '$lib/api';
	import { calendarDateTime, dateLabel } from '$lib/calendarDates';
	import type {
		SavedMeeting,
		SavedMeetingChanges,
		SavedMeetingOccurrence
	} from '$lib/savedMeetings';
	import { formatTime } from './formatTime';
	let {
		meeting,
		occurrence,
		militaryTime,
		onupdate,
		ondelete,
		onbusy
	}: {
		meeting: SavedMeeting;
		occurrence: SavedMeetingOccurrence;
		militaryTime: boolean;
		onupdate: (meeting: SavedMeeting) => Promise<void>;
		ondelete: () => void;
		onbusy: (busy: boolean) => void;
	} = $props();
	let editing = $state(false);
	let deleting = $state(false);
	let busy = $state(false);
	let error = $state('');
	let title = $state(meeting.title);
	let location = $state(meeting.location ?? '');
	let startDate = $state(meeting.start_time.slice(0, 10));
	let startTime = $state(meeting.start_time.slice(11, 16));
	let endDate = $state(meeting.end_time.slice(0, 10));
	let endTime = $state(meeting.end_time.slice(11, 16));
	const providerNames = {
		google: 'Google Calendar',
		microsoft: 'Microsoft Calendar',
		ics: 'ICS feed'
	};
	const publicationLabels = {
		queued: 'Queued',
		published: 'Published',
		failed: 'Failed',
		removed: 'Removed'
	};
	const invitationLabels = {
		not_requested: '',
		queued: 'Invitations queued',
		sent: 'Invitations sent',
		cancelled: 'Invitations cancelled',
		failed: 'Invitations failed'
	};

	function reset() {
		title = meeting.title;
		location = meeting.location ?? '';
		startDate = meeting.start_time.slice(0, 10);
		startTime = meeting.start_time.slice(11, 16);
		endDate = meeting.end_time.slice(0, 10);
		endTime = meeting.end_time.slice(11, 16);
		error = '';
	}

	async function save() {
		if (busy || !meeting.can_edit || meeting.role !== 'owner') return;
		error = '';
		try {
			if (!title.trim() || title.trim().length > 200 || location.trim().length > 200)
				throw new Error('Enter a title and keep the title and location within 200 characters.');
			const changes: SavedMeetingChanges = {};
			if (title.trim() !== meeting.title) changes.title = title.trim();
			if (location.trim() !== (meeting.location ?? '')) changes.location = location.trim() || null;
			if (
				startDate !== meeting.start_time.slice(0, 10) ||
				startTime !== meeting.start_time.slice(11, 16)
			)
				changes.start_time = calendarDateTime(startDate, startTime, meeting.time_zone);
			if (endDate !== meeting.end_time.slice(0, 10) || endTime !== meeting.end_time.slice(11, 16))
				changes.end_time = calendarDateTime(endDate, endTime, meeting.time_zone);
			const duration =
				Date.parse(changes.end_time ?? meeting.end_time) -
				Date.parse(changes.start_time ?? meeting.start_time);
			if (duration <= 0 || duration > 12 * 60 * 60 * 1000)
				throw new Error('The end must be after the start and within 12 hours.');
			if (!Object.keys(changes).length) {
				editing = false;
				return;
			}
			busy = true;
			onbusy(true);
			const response = await API.updateSavedMeeting(meeting.id, changes);
			await onupdate(response.meeting);
			editing = false;
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Could not save the meeting.';
		} finally {
			busy = false;
			onbusy(false);
		}
	}

	async function remove() {
		if (busy || !meeting.can_delete || meeting.role !== 'owner') return;
		busy = true;
		onbusy(true);
		error = '';
		try {
			await API.deleteSavedMeeting(meeting.id);
			ondelete();
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Could not delete the meeting.';
		} finally {
			busy = false;
			onbusy(false);
		}
	}
</script>

<div class="gap-4 grid">
	<p class="text-sm text-on-surface-variant">
		{dateLabel(occurrence.start_time.slice(0, 10))} · {formatTime(
			occurrence.start_time.slice(11, 16),
			militaryTime
		)}–{formatTime(occurrence.end_time.slice(11, 16), militaryTime)}
		{#if occurrence.end_time.slice(0, 10) !== occurrence.start_time.slice(0, 10)}
			· ends {dateLabel(occurrence.end_time.slice(0, 10))}{/if}
		· Eastern time
	</p>
	<p class="text-sm">Organizer: {meeting.owner.name}</p>
	{#if meeting.location && !editing}<p class="text-sm">Location: {meeting.location}</p>{/if}
	<p class="text-sm">
		Participants: {meeting.friends
			.map((friend) => friend.name)
			.concat(meeting.guest ? [meeting.guest.name] : [])
			.join(', ') || 'None'}
	</p>
	{#if meeting.frequency === 'weekly'}
		<p class="text-sm">
			Repeats weekly{meeting.repeat_until ? ` through ${dateLabel(meeting.repeat_until)}` : ''}.
			Editing or deleting applies to the whole series.
		</p>
	{/if}
	{#if meeting.role === 'invitee'}
		<p class="text-sm text-on-surface-variant">
			You are invited. Respond using your calendar invitation.
		</p>
	{:else}
		<p class="text-sm text-on-surface-variant">
			{meeting.invite_friends
				? 'Calendar invitations requested.'
				: 'Calendar invitations were not requested.'}
		</p>
		{#if meeting.destinations.length}<p class="text-sm">
				Destinations: {meeting.destinations.map((provider) => providerNames[provider]).join(', ')}
			</p>{/if}
		<ul class="gap-2 text-sm grid">
			{#each meeting.publications as publication (publication.provider)}
				<li>
					{providerNames[publication.provider]}: {publicationLabels[
						publication.status
					]}{#if invitationLabels[publication.invitation_status]}
						· {invitationLabels[publication.invitation_status]}{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if editing && meeting.can_edit && meeting.role === 'owner'}
		<form
			class="gap-4 grid"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<TextFieldOutlined label="Title" bind:value={title} disabled={busy} />
			<TextFieldOutlined label="Location (optional)" bind:value={location} disabled={busy} />
			{#if meeting.frequency === 'weekly'}<p class="text-sm text-on-surface-variant">
					These dates and times are the first occurrence of the series. Moving it may change the
					term's repeat end date.
				</p>{/if}
			<div class="gap-3 grid grid-cols-2">
				<label class="gap-1 text-sm grid"
					>Start date<input
						class="rounded border-outline bg-surface p-2 border"
						type="date"
						bind:value={startDate}
						disabled={busy}
						required
					/></label
				>
				<label class="gap-1 text-sm grid"
					>Start time<input
						class="rounded border-outline bg-surface p-2 border"
						type="time"
						bind:value={startTime}
						disabled={busy}
						required
					/></label
				>
				<label class="gap-1 text-sm grid"
					>End date<input
						class="rounded border-outline bg-surface p-2 border"
						type="date"
						bind:value={endDate}
						disabled={busy}
						required
					/></label
				>
				<label class="gap-1 text-sm grid"
					>End time<input
						class="rounded border-outline bg-surface p-2 border"
						type="time"
						bind:value={endTime}
						disabled={busy}
						required
					/></label
				>
			</div>
			<div class="gap-2 flex justify-end">
				<Button
					variant="text"
					disabled={busy}
					onclick={() => {
						editing = false;
						error = '';
					}}>Cancel</Button
				>
				<Button type="submit" disabled={busy}
					>{busy
						? 'Saving…'
						: meeting.frequency === 'weekly'
							? 'Save series'
							: 'Save meeting'}</Button
				>
			</div>
		</form>
	{:else if deleting && meeting.can_delete && meeting.role === 'owner'}
		<p class="text-sm">
			Delete {meeting.frequency === 'weekly' ? 'every occurrence in this series' : 'this meeting'}?
			Calendar removal and invitation cancellations are processed afterward.
		</p>
		<div class="gap-2 flex justify-end">
			<Button
				variant="text"
				disabled={busy}
				onclick={() => {
					deleting = false;
					error = '';
				}}>Cancel</Button
			>
			<Button disabled={busy} onclick={remove}
				>{busy
					? 'Deleting…'
					: meeting.frequency === 'weekly'
						? 'Delete series'
						: 'Delete meeting'}</Button
			>
		</div>
	{:else}
		<div class="gap-2 flex justify-end">
			{#if meeting.can_edit && meeting.role === 'owner'}<Button
					variant="tonal"
					onclick={() => {
						reset();
						editing = true;
					}}>Edit {meeting.frequency === 'weekly' ? 'series' : 'meeting'}</Button
				>{/if}
			{#if meeting.can_delete && meeting.role === 'owner'}<Button
					variant="text"
					onclick={() => {
						deleting = true;
						error = '';
					}}>Delete {meeting.frequency === 'weekly' ? 'series' : 'meeting'}</Button
				>{/if}
		</div>
	{/if}
	{#if error}<p class="text-sm text-error" role="alert">{error}</p>{/if}
</div>
