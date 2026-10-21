<script lang="ts">
	import { untrack } from 'svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import { Button, Dialog, SelectOutlined, TextFieldOutlined } from 'm3-svelte';
	import { calendarDateTime, dateLabel, formatTime, minutesTime } from '$lib/datetime';
	import {
		providerLabel,
		type SavedMeeting,
		type SavedMeetingChanges,
		type SavedMeetingSelection
	} from '$lib/friends/savedMeetings';
	let {
		meeting,
		occurrence,
		militaryTime,
		onsave,
		onupdate,
		ondelete,
		onleave,
		onremoved,
		onclose,
		onbusy
	}: SavedMeetingSelection & {
		militaryTime: boolean;
		onsave: (id: string, changes: SavedMeetingChanges) => Promise<SavedMeeting>;
		onupdate: (meeting: SavedMeeting) => Promise<void>;
		ondelete: (id: string) => Promise<void>;
		onleave: (id: string) => Promise<void>;
		onremoved: (id: string) => void;
		onclose: () => void;
		onbusy: (busy: boolean) => void;
	} = $props();
	let mode = $state<'details' | 'edit' | 'delete' | 'leave' | 'closed'>('details');
	let busy = $state(false);
	let error = $state('');
	let title = $state(untrack(() => meeting.title));
	let location = $state(untrack(() => meeting.location ?? ''));
	let startDate = $state(untrack(() => meeting.start_time.slice(0, 10)));
	let startTime = $state(untrack(() => meeting.start_time.slice(11, 16)));
	let duration = $state(
		untrack(() => String((Date.parse(meeting.end_time) - Date.parse(meeting.start_time)) / 60000))
	);
	let customDuration = $state(false);
	let exactStart = $state(false);
	const series = $derived(meeting.frequency === 'weekly');
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
	const starts = $derived(
		[...new Set([...Array.from({ length: 96 }, (_, index) => minutesTime(index * 15)), startTime])]
			.sort()
			.map((value) => ({ value, text: formatTime(value, militaryTime) }))
	);
	const durations = $derived(
		[...new Set([15, 30, 45, 60, 90, 120, Number(duration)])]
			.filter((value) => Number.isFinite(value) && value > 0 && value <= 720)
			.sort((a, b) => a - b)
			.map((value) => ({ value: String(value), text: `${value} min` }))
	);
	const calculated = $derived.by(() => {
		try {
			if (
				!duration ||
				!Number.isFinite(Number(duration)) ||
				Number(duration) <= 0 ||
				Number(duration) > 720
			)
				return null;
			const start =
				startDate === meeting.start_time.slice(0, 10) &&
				startTime === meeting.start_time.slice(11, 16)
					? meeting.start_time
					: calendarDateTime(startDate, startTime, meeting.time_zone);
			const end = new Date(Date.parse(start) + Number(duration) * 60000).toISOString();
			const parts = Object.fromEntries(
				new Intl.DateTimeFormat('en-US', {
					timeZone: meeting.time_zone,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					hourCycle: 'h23'
				})
					.formatToParts(new Date(end))
					.map((part) => [part.type, part.value])
			);
			return {
				start,
				end,
				date: `${parts.year}-${parts.month}-${parts.day}`,
				time: `${parts.hour}:${parts.minute}`
			};
		} catch {
			return null;
		}
	});
	$effect(() => {
		if (mode === 'closed') onclose();
	});
	function switchMode(next: typeof mode) {
		if (busy) return;
		error = '';
		mode = next;
	}
	function edit() {
		title = meeting.title;
		location = meeting.location ?? '';
		startDate = meeting.start_time.slice(0, 10);
		startTime = meeting.start_time.slice(11, 16);
		duration = String((Date.parse(meeting.end_time) - Date.parse(meeting.start_time)) / 60000);
		customDuration = false;
		exactStart = false;
		switchMode('edit');
	}
	async function save() {
		if (busy || !meeting.can_edit || meeting.role !== 'owner') return;
		error = '';
		try {
			if (!title.trim() || title.trim().length > 200 || location.trim().length > 200)
				throw new Error('Enter a title and keep the title and location within 200 characters.');
			if (!calculated)
				throw new Error('Choose a valid date, start time, and duration of up to 720 minutes.');
			const changes: SavedMeetingChanges = {};
			if (title.trim() !== meeting.title) changes.title = title.trim();
			if (location.trim() !== (meeting.location ?? '')) changes.location = location.trim() || null;
			if (Date.parse(calculated.start) !== Date.parse(meeting.start_time))
				changes.start_time = calculated.start;
			if (Date.parse(calculated.end) !== Date.parse(meeting.end_time))
				changes.end_time = calculated.end;
			if (!Object.keys(changes).length) {
				switchMode('details');
				return;
			}
			busy = true;
			onbusy(true);
			const updated = await onsave(meeting.id, changes);
			await onupdate(updated);
		} catch (failure) {
			error = failure instanceof Error ? failure.message : 'Could not save the meeting.';
		} finally {
			busy = false;
			onbusy(false);
		}
	}
	async function endMeeting() {
		if (
			busy ||
			(mode === 'delete'
				? !meeting.can_delete || meeting.role !== 'owner'
				: mode !== 'leave' || !meeting.can_leave || meeting.role !== 'invitee')
		)
			return;
		busy = true;
		onbusy(true);
		error = '';
		try {
			await (mode === 'delete' ? ondelete(meeting.id) : onleave(meeting.id));
			onremoved(meeting.id);
		} catch (failure) {
			error = failure instanceof Error ? failure.message : `Could not ${mode} the meeting.`;
		} finally {
			busy = false;
			onbusy(false);
		}
	}
	function cancel(event: Event) {
		if (busy) event.preventDefault();
	}
</script>

<div class="modal-host friends-preview">
	<Dialog
		bind:open={
			() => mode === 'details',
			(value) => {
				if (!value && mode === 'details' && !busy) mode = 'closed';
			}
		}
		headline="Meeting details"
		role="dialog"
		aria-label="Meeting details"
		closedby={busy ? 'none' : 'closerequest'}
		oncancel={cancel}
	>
		{#snippet buttons()}
			<div class="footer">
				<Button variant="text" disabled={busy} onclick={() => switchMode('closed')}>Close</Button
				>{#if meeting.can_leave && meeting.role === 'invitee'}<Button
						variant="text"
						disabled={busy}
						onclick={() => switchMode('leave')}>Leave {series ? 'series' : 'meeting'}</Button
					>{/if}{#if meeting.can_delete && meeting.role === 'owner'}<Button
						variant="text"
						disabled={busy}
						onclick={() => switchMode('delete')}>Delete {series ? 'series' : 'meeting'}</Button
					>{/if}{#if meeting.can_edit && meeting.role === 'owner'}<Button
						variant="tonal"
						disabled={busy}
						onclick={edit}>Edit {series ? 'series' : 'meeting'}</Button
					>{/if}
			</div>
		{/snippet}
		<div class="detail-content">
			<h3 class="m3-font-title-large">{meeting.title}</h3>
			<p>{dateLabel(occurrence.start_time.slice(0, 10))}, {occurrence.start_time.slice(0, 4)}</p>
			<p>
				{formatTime(occurrence.start_time.slice(11, 16), militaryTime)} - {formatTime(
					occurrence.end_time.slice(11, 16),
					militaryTime
				)} - Eastern time{#if occurrence.end_time.slice(0, 10) !== occurrence.start_time.slice(0, 10)}<br
					/>Ends {dateLabel(occurrence.end_time.slice(0, 10))}{/if}
			</p>
			<dl>
				<div>
					<dt>Your role</dt>
					<dd>{meeting.role === 'owner' ? 'Organizer' : 'Invitee'}</dd>
				</div>
				<div>
					<dt>Organizer</dt>
					<dd>{meeting.owner.name}</dd>
				</div>
				<div>
					<dt>Participants</dt>
					<dd>{meeting.friends.map((friend) => friend.name).join(', ') || 'None'}</dd>
				</div>
				{#if meeting.guest}<div>
						<dt>Guest</dt>
						<dd>{meeting.guest.name}<br />{meeting.guest.email}</dd>
					</div>{/if}{#if meeting.location}<div>
						<dt>Location</dt>
						<dd>{meeting.location}</dd>
					</div>{/if}
				<div>
					<dt>Repeat</dt>
					<dd>
						{series
							? `Weekly${meeting.repeat_until ? ` through ${dateLabel(meeting.repeat_until)}, ${meeting.repeat_until.slice(0, 4)}` : ''}`
							: 'Once'}
					</dd>
				</div>
			</dl>
			{#if series}<p class="notice">
					{meeting.role === 'owner'
						? 'Editing or deleting applies to the whole series.'
						: 'Leaving applies to the whole series.'}
				</p>{/if}
			{#if meeting.role === 'invitee'}<p class="notice">
					This meeting counts as busy. Respond to calendar invitations in your calendar.
				</p>{:else}
				{#if meeting.destinations.length}<dl>
						<div>
							<dt>Calendars</dt>
							<dd>{meeting.destinations.map(providerLabel).join(', ')}</dd>
						</div>
					</dl>{/if}
				<p class="notice">
					{meeting.invite_friends
						? 'Calendar invitations requested.'
						: 'Friend invitations not requested.'}
				</p>
				{#if meeting.publications.length}<ul class="publications">
						{#each meeting.publications as publication (publication.provider)}<li>
								<strong>{providerLabel(publication.provider)}</strong><span
									>{publicationLabels[publication.status]}{invitationLabels[
										publication.invitation_status
									]
										? ` - ${invitationLabels[publication.invitation_status]}`
										: ''}</span
								>
							</li>{/each}
					</ul>{/if}
			{/if}
		</div>
	</Dialog>
	<Dialog
		bind:open={
			() => mode === 'edit',
			(value) => {
				if (!value && mode === 'edit' && !busy) switchMode('details');
			}
		}
		headline={series ? 'Edit series' : 'Edit meeting'}
		role="dialog"
		aria-label={series ? 'Edit series' : 'Edit meeting'}
		closedby={busy ? 'none' : 'closerequest'}
		oncancel={cancel}
	>
		{#snippet buttons()}<div class="footer">
				<Button variant="text" disabled={busy} onclick={() => switchMode('details')}>Cancel</Button
				><Button disabled={busy} onclick={() => void save()}
					>{busy ? 'Saving...' : series ? 'Save series' : 'Save meeting'}</Button
				>
			</div>{/snippet}
		<form
			class="editor-content"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			{#if series}<p class="notice">
					Editing the whole series. These fields describe its first occurrence. Moving the start may
					change the term's repeat end date.
				</p>{/if}
			<TextFieldOutlined
				label="Meeting title"
				required
				maxlength={200}
				bind:value={title}
				disabled={busy}
			/>
			<DateField
				label={series ? 'First occurrence date' : 'Meeting date'}
				required
				bind:value={startDate}
				disabled={busy}
			/>
			<div class="time-fields">
				{#if exactStart}<TextFieldOutlined
						label="Start time"
						type="time"
						required
						bind:value={startTime}
						disabled={busy}
					/>{:else}<SelectOutlined
						label="Start time"
						bind:value={startTime}
						options={starts}
						disabled={busy}
					/>{/if}{#if customDuration}<TextFieldOutlined
						label="Duration (minutes)"
						type="number"
						min="0.01"
						max="720"
						step="any"
						bind:value={duration}
						disabled={busy}
					/>{:else}<SelectOutlined
						label="Duration"
						bind:value={duration}
						options={durations}
						disabled={busy}
					/>{/if}
			</div>
			<div class="time-options">
				<Button variant="text" disabled={busy} onclick={() => (exactStart = !exactStart)}
					>{exactStart ? 'Use start options' : 'Enter exact time'}</Button
				><Button variant="text" disabled={busy} onclick={() => (customDuration = !customDuration)}
					>{customDuration ? 'Use duration options' : 'Custom duration'}</Button
				>
			</div>
			<p class="end-summary" aria-live="polite">
				{calculated
					? `Ends ${dateLabel(calculated.date)} at ${formatTime(calculated.time, militaryTime)} - Eastern time`
					: 'Choose a valid date, start time, and duration.'}
			</p>
			<TextFieldOutlined
				label="Location (optional)"
				maxlength={200}
				bind:value={location}
				disabled={busy}
			/>
			{#if error}<p class="text-error" role="alert">{error}</p>{/if}
		</form>
	</Dialog>
	<Dialog
		bind:open={
			() => mode === 'delete' || mode === 'leave',
			(value) => {
				if (!value && (mode === 'delete' || mode === 'leave') && !busy) switchMode('details');
			}
		}
		headline={`${mode === 'leave' ? 'Leave' : 'Delete'} ${series ? 'series' : 'meeting'}?`}
		role="alertdialog"
		aria-label={`${mode === 'leave' ? 'Leave' : 'Delete'} ${series ? 'series' : 'meeting'}?`}
		closedby={busy ? 'none' : 'closerequest'}
		oncancel={cancel}
	>
		{#snippet buttons()}<div class="footer">
				<Button variant="text" disabled={busy} onclick={() => switchMode('details')}>Cancel</Button
				><Button disabled={busy} onclick={() => void endMeeting()}
					>{busy
						? mode === 'leave'
							? 'Leaving...'
							: 'Deleting...'
						: `${mode === 'leave' ? 'Leave' : 'Delete'} ${series ? 'series' : 'meeting'}`}</Button
				>
			</div>{/snippet}
		<div class="detail-content">
			<h3 class="m3-font-title-medium">{meeting.title}</h3>
			<p>
				{mode === 'leave'
					? `Remove ${series ? 'every occurrence' : 'this meeting'} from your meetings, busy time, and ICS feed? The organizer keeps the meeting.`
					: `Delete ${series ? 'every occurrence in this series' : 'this meeting'} for everyone? Calendar removal and invitation cancellations are processed afterward.`}
			</p>
			{#if error}<p class="text-error" role="alert">{error}</p>{/if}
		</div>
	</Dialog>
</div>

<style>
	.modal-host :global(dialog) {
		width: min(35rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: calc(100dvh - 2rem);
		overflow: hidden;
	}
	.modal-host :global(dialog > .headline),
	.modal-host :global(dialog > .buttons) {
		flex-shrink: 0;
	}
	.modal-host :global(dialog > .content) {
		min-height: 0;
		overflow-y: auto;
	}
	.detail-content,
	.editor-content {
		display: grid;
		gap: 1rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	h3,
	p,
	dl,
	dd {
		margin: 0;
	}
	dl {
		display: grid;
		gap: 0.75rem;
	}
	dl > div {
		display: grid;
		grid-template-columns: 6rem minmax(0, 1fr);
		gap: 0.75rem;
	}
	dt,
	.notice,
	.publications span {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	dd {
		overflow-wrap: anywhere;
	}
	.notice {
		font-size: 0.875rem;
	}
	.time-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}
	.editor-content :global(.m3-textfield),
	.time-fields > :global(*) {
		min-width: 0;
		width: 100%;
	}
	.end-summary {
		padding: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container));
		border-radius: 0.75rem;
	}
	.time-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.publications {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.75rem;
	}
	.publications li {
		display: grid;
		gap: 0.25rem;
	}
	@media (max-width: 480px) {
		dl > div {
			grid-template-columns: 5rem minmax(0, 1fr);
		}
	}
	@supports (top: anchor(bottom)) {
		.modal-host :global(.picker) {
			position-area: none;
			width: min(20.5rem, calc(100vw - 1.5rem));
			top: anchor(bottom);
			left: clamp(
				0.75rem,
				anchor(left),
				calc(100vw - 0.75rem - min(20.5rem, calc(100vw - 1.5rem)))
			);
			right: auto;
			bottom: auto;
			margin: 0.5rem 0 0;
			position-try-fallbacks: --saved-meeting-date-above;
		}
	}
	@position-try --saved-meeting-date-above {
		top: auto;
		bottom: anchor(top);
		margin: 0 0 0.5rem;
	}
</style>
