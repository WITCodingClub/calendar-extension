<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Slider, TextFieldOutlined } from 'm3-svelte';
	import type { FreePeriod, PreviewSlot } from './types';
	import { dateLabel, minutesTime, timeMinutes } from './availability';
	import { formatTime } from './formatTime';
	import { todayDate } from '$lib/calendarDates';

	let {
		period,
		slot = $bindable(),
		militaryTime,
		message,
		windowAvailable = false,
		bounds,
		onadd,
		onview
	}: {
		period: FreePeriod;
		slot: PreviewSlot;
		militaryTime: boolean;
		message?: string;
		windowAvailable?: boolean;
		bounds?: { start?: string; end?: string };
		onadd: () => void;
		onview: () => void;
	} = $props();
	let sliderVersion = $state(0);
	const chosenStart = $derived(timeMinutes(slot.start));
	const chosenEnd = $derived(timeMinutes(slot.end));
	const duration = $derived(
		chosenStart !== undefined && chosenEnd !== undefined ? chosenEnd - chosenStart : 0
	);

	function normalize(value: string, format = militaryTime): string {
		const minutes = timeMinutes(value);
		return minutes === undefined ? value : formatTime(minutesTime(minutes), format);
	}

	$effect(() => {
		const format = militaryTime;
		untrack(() => {
			slot.start = normalize(slot.start, format);
			slot.end = normalize(slot.end, format);
		});
	});

	function moveStart(start: number) {
		const length = duration;
		slot = {
			...slot,
			start: normalize(minutesTime(start)),
			end: normalize(minutesTime(start + length))
		};
	}

	function changeDuration(value: string) {
		const minutes = Number(value);
		slot.end =
			chosenStart !== undefined &&
			Number.isInteger(minutes) &&
			minutes > 0 &&
			chosenStart + minutes < 1440
				? normalize(minutesTime(chosenStart + minutes))
				: '';
	}
</script>

<div class="gap-4 grid">
	<div>
		<h3>{dateLabel(slot.date)}</h3>
		{#if period.date === slot.date && windowAvailable && !message}<p
				class="mt-1 text-sm text-on-surface-variant"
			>
				Everyone free {formatTime(minutesTime(period.start), militaryTime)}–{formatTime(
					minutesTime(period.end),
					militaryTime
				)}
			</p>{/if}
	</div>
	<div class="preview-fields min-w-0 pt-1 grid">
		<TextFieldOutlined
			label="Date"
			type="date"
			bind:value={slot.date}
			min={bounds?.start && bounds.start > todayDate() ? bounds.start : todayDate()}
			max={bounds?.end}
		/>
	</div>
	<div
		class="gap-4 rounded-xl bg-surface-container p-3 grid [--m3-util-background:rgb(var(--m3-scheme-surface-container))]"
	>
		<div class="gap-3 flex flex-wrap items-center justify-between">
			<div class="min-w-0">
				<p class="text-xs text-on-surface-variant">Meeting time</p>
				<p class="mt-1 text-lg font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
					{normalize(slot.start)}–{normalize(slot.end)}
				</p>
			</div>
			<div class="preview-fields min-w-0 w-28 pt-1 grid">
				<TextFieldOutlined
					label="Duration (min)"
					type="number"
					min="1"
					step="1"
					value={duration > 0 ? String(duration) : ''}
					oninput={(event) => changeDuration(event.currentTarget.value)}
				/>
			</div>
		</div>
		{#if windowAvailable && period.date === slot.date && duration > 0 && period.end - period.start > duration}
			<div>
				<p class="mb-1 text-sm">Slide to move the meeting</p>
				{#key sliderVersion + ':' + duration}
					<Slider
						bind:value={
							() =>
								chosenStart !== undefined
									? Math.min(Math.max(chosenStart, period.start), period.end - duration)
									: period.start,
							moveStart
						}
						min={period.start}
						max={period.end - duration}
						step={1}
						size="s"
						showValue={false}
						aria-label="Meeting start time"
						aria-valuetext={normalize(slot.start)}
					/>
				{/key}
				<div class="gap-2 text-xs text-on-surface-variant flex justify-between tabular-nums">
					<span>{formatTime(minutesTime(period.start), militaryTime)}</span>
					<span>{formatTime(minutesTime(period.end - duration), militaryTime)}</span>
				</div>
			</div>
		{/if}
		<div class="preview-fields min-w-0 gap-3 pt-1 grid grid-cols-2">
			<TextFieldOutlined
				label="Start"
				bind:value={slot.start}
				oninput={() => ++sliderVersion}
				onblur={() => (slot.start = normalize(slot.start))}
			/>
			<TextFieldOutlined
				label="End"
				bind:value={slot.end}
				onblur={() => (slot.end = normalize(slot.end))}
			/>
		</div>
	</div>
	{#if message}<p class="text-sm text-error" role="status">{message}</p>{/if}
	<div class="gap-2 flex flex-wrap items-center justify-end">
		<Button variant="text" disabled={Boolean(message)} onclick={onview}>Preview on calendar</Button>
		<Button disabled={Boolean(message)} onclick={onadd}>Continue</Button>
	</div>
</div>
