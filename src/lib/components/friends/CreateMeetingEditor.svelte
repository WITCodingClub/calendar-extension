<script lang="ts">
	import { Button, Checkbox, Chip, Dialog, TextFieldOutlined } from 'm3-svelte';
	import SelectOutlined from '$lib/components/ui/SelectOutlined.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import type { ComponentProps } from 'svelte';
	import { dateLabel, formatTime, minutesTime } from '$lib/datetime';
	type SelectOption = Pick<
		ComponentProps<typeof SelectOutlined>['options'][number],
		'text' | 'value'
	>;
	let {
		open = $bindable(false),
		title = $bindable(''),
		location = $bindable(''),
		date = $bindable(''),
		start = $bindable(''),
		duration = $bindable('30'),
		frequency = $bindable('one_time'),
		calendar = $bindable(''),
		invite = $bindable(true),
		participants,
		buffer,
		rangeStart,
		rangeEnd,
		militaryTime = false,
		starts,
		canCreate = false,
		message,
		minDate,
		maxDate,
		calendarOptions,
		feedback = '',
		onsavedraft,
		ondiscard,
		oncreate,
		onpreview,
		canPreview = false,
		locked = false,
		submitting = false,
		createLabel,
		onretry
	}: {
		open?: boolean;
		title?: string;
		location?: string;
		date?: string;
		start?: string;
		duration?: string;
		frequency?: string;
		calendar?: string;
		invite?: boolean;
		participants: Array<{ id: string; name: string; busy: number[][]; message?: string }>;
		buffer: number;
		rangeStart: number;
		rangeEnd: number;
		militaryTime?: boolean;
		starts: Array<SelectOption & { disabled?: boolean }>;
		canCreate?: boolean;
		message?: string;
		minDate?: string;
		maxDate?: string;
		calendarOptions: SelectOption[];
		feedback?: string;
		onsavedraft: () => void;
		ondiscard: () => void;
		oncreate: () => void;
		onpreview: () => void;
		canPreview?: boolean;
		locked?: boolean;
		submitting?: boolean;
		createLabel?: string;
		onretry?: () => void;
	} = $props();
	const end = $derived(Number(start) + Number(duration));
	const conflict = $derived(Boolean(message));
	const ticks = $derived(
		Array.from({ length: 5 }, (_, index) => rangeStart + ((rangeEnd - rangeStart) * index) / 4)
	);
	const time = (value: number) => formatTime(minutesTime(Math.round(value)), militaryTime);
	const percent = (value: number) =>
		Math.max(0, Math.min(100, ((value - rangeStart) / Math.max(1, rangeEnd - rangeStart)) * 100));
</script>

<div class="editor-host friends-preview">
	<Dialog
		bind:open
		headline=""
		role="dialog"
		aria-label="Create meeting"
		closedby={locked || submitting ? 'none' : 'closerequest'}
	>
		{#snippet buttons()}
			<div class="editor-actions">
				<Button variant="text" disabled={locked || submitting} onclick={ondiscard}>Discard</Button>
				<Button variant="text" disabled={locked || submitting} onclick={onsavedraft}
					>Save draft</Button
				>
				<Button disabled={!canCreate} onclick={oncreate}>
					{createLabel || (invite ? 'Create & invite' : 'Create meeting')}
				</Button>
			</div>
		{/snippet}
		<div class="editor-content">
			<div class="editor-heading">
				<h2 class="m3-font-headline-small">Create meeting</h2>
				<Button variant="text" disabled={!canPreview} onclick={onpreview}
					>Preview on calendar</Button
				>
			</div>
			<div class="participants" aria-label="Selected participants">
				{#each participants as person (person.id)}
					<Chip variant="input" selected disabled onclick={null}>{person.name}</Chip>
				{/each}
			</div>
			<div class="preview-fields">
				<TextFieldOutlined
					disabled={locked || submitting}
					label="Meeting title"
					required
					maxlength={200}
					bind:value={title}
				/>
			</div>
			<div class="time-section">
				<div class="preview-fields">
					<DateField
						disabled={locked || submitting}
						label="Date"
						required
						bind:value={date}
						min={minDate}
						max={maxDate}
					/>
				</div>
				<div class="time-fields preview-fields">
					<SelectOutlined
						disabled={locked || submitting}
						label="Start time"
						bind:value={start}
						options={starts}
					/>
					<SelectOutlined
						disabled={locked || submitting}
						label="Duration"
						bind:value={duration}
						options={[...new Set([15, 30, 45, 60, 90, 120, Number(duration)])]
							.filter((value) => Number.isInteger(value) && value > 0 && value <= 720)
							.sort((a, b) => a - b)
							.map((value) => ({
								text: `${value} min`,
								value: String(value)
							}))}
					/>
				</div>
				<div class="time-summary" aria-live="polite">
					<span class="m3-font-body-large">Ends at {time(end)}</span>
					<span class="m3-font-body-small">{buffer}-minute class buffer included</span>
				</div>
			</div>
			<details open class="schedule-preview">
				<summary class="m3-font-label-large">Check schedules</summary>
				<div class="schedule-content">
					<p class="schedule-date m3-font-body-small">{dateLabel(date)}</p>
					<div class="timeline-ticks" aria-hidden="true">
						{#each ticks as tick, index (tick)}
							<span
								class:major={index === 0 ||
									index === Math.floor(ticks.length / 2) ||
									index === ticks.length - 1}>{time(tick)}</span
							>
						{/each}
					</div>
					<div class="timeline-rows">
						{#each participants as person (person.id)}
							<div class="timeline-row">
								<span class="person-label m3-font-label-medium">{person.name}</span>
								{#if person.message}<p class="validation m3-font-body-small">
										{person.message}
									</p>{:else}<div
										class="lane"
										role="img"
										aria-label={`${person.name}: busy ${person.busy.map(([from, until]) => `${time(from)} to ${time(until)}`).join(', ')}. Proposed meeting ${time(Number(start))} to ${time(end)}.`}
									>
										{#each person.busy as [from, until] (`${from}-${until}`)}
											<div
												class="buffer-block"
												style:left={`${percent(Math.max(from - buffer, rangeStart))}%`}
												style:width={`${Math.max(0, percent(until + buffer) - percent(from - buffer))}%`}
											></div>
											<div
												class="busy-block"
												style:left={`${percent(from)}%`}
												style:width={`${Math.max(0, percent(until) - percent(from))}%`}
											></div>
										{/each}
										<div
											class="meeting-block"
											class:conflict
											style:left={`${percent(Number(start))}%`}
											style:width={`${Math.max(0, percent(end) - percent(Number(start)))}%`}
										></div>
									</div>{/if}
							</div>
						{/each}
					</div>
					<div class="timeline-legend m3-font-body-small">
						<span><i class="legend-busy"></i>Busy</span>
						<span><i class="legend-buffer"></i>Class buffer</span>
						<span><i class="legend-meeting"></i>Your meeting</span>
					</div>
				</div>
			</details>
			{#if message}<p class="validation m3-font-body-medium" role="alert">{message}</p>
				{#if onretry}<Button variant="text" disabled={locked || submitting} onclick={onretry}
						>Retry availability and calendars</Button
					>{/if}{/if}
			<details class="more-options">
				<summary class="m3-font-label-large">
					<span>More options</span>
					<span class="options-summary m3-font-body-small"
						>{calendarOptions.find((option) => option.value === calendar)?.text ||
							'Choose calendar'} · Invites {invite ? 'on' : 'off'}</span
					>
				</summary>
				<div class="options-content preview-fields">
					<TextFieldOutlined
						disabled={locked || submitting}
						label="Location (optional)"
						bind:value={location}
						maxlength={200}
					/>
					<SelectOutlined
						disabled={locked || submitting}
						label="Repeat"
						bind:value={frequency}
						options={[
							{ text: 'Once', value: 'one_time' },
							{ text: 'Weekly through the term', value: 'weekly' }
						]}
					/>
					<SelectOutlined
						disabled={locked || submitting}
						label="Add to calendar"
						bind:value={calendar}
						options={calendarOptions}
					/>
					<label class="invite-label"
						><Checkbox
							><input
								type="checkbox"
								disabled={locked || submitting}
								bind:checked={invite}
							/></Checkbox
						><span class="m3-font-body-medium">Send calendar invitations to participants</span
						></label
					>
				</div>
			</details>
			{#if feedback}<p class="m3-font-body-medium feedback" role="status">{feedback}</p>{/if}
		</div>
	</Dialog>
</div>

<style>
	.editor-host :global(dialog > p:empty) {
		display: none;
	}
	.editor-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.editor-heading h2 {
		margin: 0;
	}
	.editor-host :global(dialog) {
		width: min(35rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: calc(100dvh - 2rem);
		overflow: hidden;
	}
	.editor-host :global(.headline) {
		flex-shrink: 0;
	}
	.editor-host :global(.content) {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin-bottom: 1rem;
		padding: 0.25rem 0.25rem 0.5rem;
	}
	.editor-host :global(.buttons) {
		flex-shrink: 0;
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		padding-top: 1rem;
	}
	.editor-content {
		display: grid;
		gap: 1.25rem;
		color: rgb(var(--m3-scheme-on-surface));
		--m3-util-background: rgb(var(--m3-scheme-surface-container-high));
	}
	.editor-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
		width: 100%;
	}
	.editor-actions :global(button:last-child) {
		margin-left: auto;
	}
	@supports (top: anchor(bottom)) {
		.editor-host :global(.picker) {
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
			position-try-fallbacks: --meeting-date-above;
		}
	}
	@position-try --meeting-date-above {
		top: auto;
		bottom: anchor(top);
		margin: 0 0 0.5rem;
	}
	.participants {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.participants :global(button:disabled) {
		background-color: rgb(var(--m3-scheme-secondary-container));
		color: rgb(var(--m3-scheme-on-secondary-container));
	}
	.preview-fields {
		display: grid;
		min-width: 0;
	}
	.time-section {
		display: grid;
		gap: 1rem;
	}
	.time-fields {
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.time-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.time-summary > span:last-child {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	details {
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		padding-top: 0.75rem;
	}
	summary {
		cursor: pointer;
		color: rgb(var(--m3-scheme-primary));
		padding-block: 0.25rem;
	}
	.schedule-content {
		margin-top: 0.75rem;
	}
	.schedule-date {
		margin: 0 0 0.75rem;
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.editor-host :global(select::picker(select)) {
		max-height: min(20rem, 50dvh);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.timeline-ticks {
		min-width: 0;
		margin-left: 4.75rem;
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		font-size: 0.625rem;
		color: rgb(var(--m3-scheme-on-surface-variant));
		margin-bottom: 0.5rem;
	}
	.timeline-ticks span {
		min-width: 0;
		white-space: nowrap;
	}
	.schedule-content {
		min-width: 0;
	}
	.timeline-rows {
		display: grid;
		gap: 0.625rem;
	}
	.timeline-row {
		display: grid;
		grid-template-columns: 4rem minmax(0, 1fr);
		align-items: center;
		gap: 0.75rem;
	}
	.person-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lane {
		height: 2rem;
		position: relative;
		background: rgb(var(--m3-scheme-surface-container-low));
		border-radius: 0.375rem;
		overflow: hidden;
	}
	.busy-block,
	.buffer-block,
	.meeting-block {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.busy-block {
		background: rgb(var(--m3-scheme-outline));
	}
	.buffer-block {
		background: repeating-linear-gradient(
			135deg,
			rgb(var(--m3-scheme-outline-variant)),
			rgb(var(--m3-scheme-outline-variant)) 3px,
			transparent 3px,
			transparent 6px
		);
	}
	.meeting-block {
		background: rgb(var(--m3-scheme-primary));
		border-radius: 0.25rem;
		top: 0.25rem;
		bottom: 0.25rem;
		box-shadow: 0 0 0 2px rgb(var(--m3-scheme-surface-container-high));
	}
	.meeting-block.conflict {
		background: rgb(var(--m3-scheme-error));
	}
	.timeline-legend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.timeline-legend span {
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
	}
	.timeline-legend i {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 0.125rem;
	}
	.legend-busy {
		background: rgb(var(--m3-scheme-outline));
	}
	.legend-buffer {
		background: repeating-linear-gradient(
			135deg,
			rgb(var(--m3-scheme-outline-variant)),
			rgb(var(--m3-scheme-outline-variant)) 2px,
			transparent 2px,
			transparent 4px
		);
	}
	.legend-meeting {
		background: rgb(var(--m3-scheme-primary));
	}
	.options-summary {
		margin-left: 0.5rem;
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.options-content {
		padding-top: 1.25rem;
		gap: 1rem;
	}
	.options-content :global(input) {
		box-sizing: border-box;
	}
	.invite-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.75rem;
	}
	.validation {
		margin: 0;
		color: rgb(var(--m3-scheme-error));
	}
	.feedback {
		margin: 0;
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	@media (max-width: 480px) {
		.editor-host :global(dialog) {
			padding: 1.25rem;
			max-height: calc(100dvh - 1.5rem);
		}
		.editor-actions {
			gap: 0.25rem;
		}
		.editor-actions :global(button:last-child) {
			margin-left: 0;
		}
		.timeline-ticks > span:not(.major) {
			display: none;
		}
		.options-summary {
			display: block;
			margin: 0.375rem 0 0 1rem;
		}
	}
</style>
