<script lang="ts">
	import { Button, Checkbox, SelectOutlined, TextFieldOutlined } from 'm3-svelte';
	import type { PreviewPerson, PreviewSlot } from './fixtures';
	import { dateLabel } from '$lib/calendarDates';
	import { minutesTime, timeMinutes } from './availability';
	import { formatTime } from './formatTime';
	let {
		slot,
		title = $bindable(''),
		location = $bindable(''),
		participants,
		onback,
		onview,
		militaryTime,
		message
	}: {
		slot: PreviewSlot;
		title?: string;
		location?: string;
		participants: PreviewPerson[];
		onback: () => void;
		onview: () => void;
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
		<div class="shrink-0"><Button variant="text" onclick={onback}>Change time</Button></div>
	</section>
	<div class="preview-fields min-w-0 gap-4 pt-1 grid">
		<TextFieldOutlined label="Title" bind:value={title} />
		<TextFieldOutlined label="Location (optional)" bind:value={location} />
		<SelectOutlined
			label="Destination calendar"
			value=""
			disabled
			options={[{ text: 'Choose a calendar', value: '' }]}
			width="100%"
		/>
	</div>
	<p class="text-sm text-on-surface-variant">
		Participants: {participants.map((person) => person.name).join(', ') || 'None selected'}
	</p>
	<label class="min-h-12 gap-4 text-sm flex items-center"
		><Checkbox><input type="checkbox" disabled /></Checkbox>Send invitations when supported</label
	>
	{#if message}<p class="text-sm text-error" role="status">{message}</p>{/if}
	<div class="gap-2 flex flex-wrap items-center justify-end">
		<Button variant="tonal" disabled={Boolean(message)} onclick={onview}>Preview on calendar</Button
		>
		<Button disabled>Create meeting</Button>
	</div>
</div>
