<script lang="ts">
	import { Button, Checkbox, SelectOutlined, TextFieldOutlined } from 'm3-svelte';
	import type { Participant, PreviewSlot } from './types';
	import { dateLabel } from '$lib/calendarDates';
	import { minutesTime, timeMinutes } from './availability';
	import { formatTime } from './formatTime';
	let {
		slot,
		title = $bindable(''),
		location = $bindable(''),
		destinations = $bindable<Array<'google' | 'microsoft' | 'ics'>>(['ics']),
		inviteFriends = $bindable(true),
		frequency = $bindable<'one_time' | 'weekly'>('one_time'),
		availableDestinations,
		accountsLoading,
		accountsError,
		submitting,
		attempted,
		error,
		participants,
		onback,
		onview,
		oncreate,
		militaryTime,
		message
	}: {
		slot: PreviewSlot;
		title?: string;
		location?: string;
		destinations?: Array<'google' | 'microsoft' | 'ics'>;
		inviteFriends?: boolean;
		frequency?: 'one_time' | 'weekly';
		availableDestinations: Array<'google' | 'microsoft' | 'ics'>;
		accountsLoading: boolean;
		accountsError: string;
		submitting: boolean;
		attempted: boolean;
		error?: string;
		participants: Participant[];
		onback: () => void;
		onview: () => void;
		oncreate: () => void;
		militaryTime: boolean;
		message?: string;
	} = $props();

	function normalize(value: string, format = militaryTime): string {
		const minutes = timeMinutes(value);
		return minutes === undefined ? value : formatTime(minutesTime(minutes), format);
	}
</script>

<div class="gap-4 grid">
	<section
		class="gap-3 rounded-xl bg-surface-container p-3 flex items-center justify-between"
		aria-label="Meeting date and time"
	>
		<div class="min-w-0">
			<p class="text-sm font-medium">{dateLabel(slot.date)}</p>
			<p class="mt-1 text-lg font-semibold tabular-nums">
				{normalize(slot.start)}–{normalize(slot.end)}
			</p>
		</div>
		<div class="shrink-0">
			<Button variant="text" disabled={submitting || attempted} onclick={onback}>Change time</Button
			>
		</div>
	</section>
	<div class="preview-fields min-w-0 gap-4 pt-1 grid">
		<TextFieldOutlined
			label="Title"
			maxlength={200}
			disabled={submitting || attempted}
			bind:value={title}
		/>
		<TextFieldOutlined
			label="Location (optional)"
			maxlength={200}
			disabled={submitting || attempted}
			bind:value={location}
		/>
		<SelectOutlined
			label="Repeat"
			bind:value={frequency}
			disabled={submitting || attempted}
			options={[
				{ text: 'Once', value: 'one_time' },
				{ text: 'Weekly through the term', value: 'weekly' }
			]}
			width="100%"
		/>
	</div>
	<fieldset class="gap-1 grid" disabled={submitting || attempted || accountsLoading}>
		<legend class="text-sm font-medium">Destination calendars</legend>
		{#each availableDestinations as destination (destination)}
			<label class="min-h-10 gap-3 text-sm flex items-center"
				><Checkbox><input type="checkbox" bind:group={destinations} value={destination} /></Checkbox
				>{destination === 'google'
					? 'Google Calendar'
					: destination === 'microsoft'
						? 'Microsoft Calendar'
						: 'ICS calendar feed'}</label
			>
		{/each}
	</fieldset>
	{#if accountsLoading}<p class="text-sm text-on-surface-variant">
			Loading connected calendars…
		</p>{/if}
	{#if accountsError}<p class="text-sm text-on-surface-variant" role="status">
			{accountsError} You can still use the ICS calendar feed.
		</p>{/if}
	<p class="text-sm text-on-surface-variant">
		Participants: {participants.map((person) => person.name).join(', ') || 'None selected'}
	</p>
	<label class="min-h-12 gap-4 text-sm flex items-center"
		><Checkbox
			><input
				type="checkbox"
				bind:checked={inviteFriends}
				disabled={submitting || attempted}
			/></Checkbox
		>Send an invite to participants</label
	>
	{#if error}<p class="text-sm text-error" role="status">{error}</p>
	{:else if message && !attempted}<p class="text-sm text-error" role="status">{message}</p>{/if}
	<div class="gap-2 flex flex-wrap items-center justify-end">
		<Button variant="tonal" disabled={submitting || attempted || Boolean(message)} onclick={onview}
			>Preview on calendar</Button
		>
		<Button
			disabled={submitting ||
				(!attempted &&
					(accountsLoading || Boolean(message) || !title.trim() || !destinations.length))}
			onclick={oncreate}
			>{submitting ? 'Creating…' : attempted ? 'Retry creation' : 'Create meeting'}</Button
		>
	</div>
</div>
