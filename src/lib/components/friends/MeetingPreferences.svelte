<script lang="ts">
	import { untrack } from 'svelte';
	import { Switch, TextFieldOutlined } from 'm3-svelte';
	import { formatTime } from './formatTime';
	import { timeMinutes, minutesTime } from './availability';
	import { type MeetingPreferences as Preferences } from './types';
	import { validDate } from '$lib/friendSchedule';
	let {
		preferences = $bindable(),
		militaryTime,
		bounds
	}: {
		preferences: Preferences;
		militaryTime: boolean;
		bounds?: { start?: string; end?: string };
	} = $props();
	const dateError = $derived(
		!validDate(preferences.from) ||
			!validDate(preferences.until) ||
			preferences.from > preferences.until ||
			Boolean(bounds?.start && preferences.from < bounds.start) ||
			Boolean(bounds?.end && preferences.until > bounds.end)
	);
	const start = $derived(timeMinutes(preferences.dailyStart));
	const end = $derived(timeMinutes(preferences.dailyEnd));
	const timeError = $derived(start === undefined || end === undefined || start >= end);

	function normalizeTime(value: string, format = militaryTime) {
		const minutes = timeMinutes(value);
		return minutes === undefined ? value : formatTime(minutesTime(minutes), format);
	}

	$effect(() => {
		const format = militaryTime;
		untrack(() => {
			preferences.dailyStart = normalizeTime(preferences.dailyStart, format);
			preferences.dailyEnd = normalizeTime(preferences.dailyEnd, format);
		});
	});
</script>

<section
	class="min-w-0 gap-4 rounded-2xl border-outline-variant/65 bg-surface-container-low p-4 grid border"
	aria-label="Meeting preferences"
>
	<div
		class="preview-fields min-w-0 gap-4 pt-1 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]"
	>
		<TextFieldOutlined
			label="From"
			error={dateError}
			type="date"
			bind:value={preferences.from}
			min={bounds?.start}
			max={bounds?.end}
		/>
		<TextFieldOutlined
			label="Until"
			error={dateError}
			type="date"
			bind:value={preferences.until}
			min={bounds?.start}
			max={bounds?.end}
		/>
		<TextFieldOutlined
			label="Duration (minutes)"
			error={!preferences.duration.trim() ||
				!Number.isInteger(Number(preferences.duration)) ||
				Number(preferences.duration) <= 0}
			type="number"
			value={preferences.duration}
			oninput={(event) => (preferences.duration = event.currentTarget.value)}
			min="1"
			step="1"
		/>
		<TextFieldOutlined
			label="Daily start"
			error={timeError}
			bind:value={preferences.dailyStart}
			onblur={() => (preferences.dailyStart = normalizeTime(preferences.dailyStart))}
		/>
		<TextFieldOutlined
			label="Daily end"
			error={timeError}
			bind:value={preferences.dailyEnd}
			onblur={() => (preferences.dailyEnd = normalizeTime(preferences.dailyEnd))}
		/>
	</div>
	<details
		class="[&_summary]:py-2 [&_summary]:text-sm [&_summary]:text-primary [&[open]>:not(summary)]:mt-3 [&_summary]:cursor-pointer"
	>
		<summary>Additional options</summary>
		<div class="mt-4 min-w-0 gap-4 grid">
			<div class="preview-fields min-w-0 grid">
				<TextFieldOutlined
					label="Buffer (minutes)"
					error={!preferences.buffer.trim() ||
						!Number.isInteger(Number(preferences.buffer)) ||
						Number(preferences.buffer) < 0}
					type="number"
					value={preferences.buffer}
					oninput={(event) => (preferences.buffer = event.currentTarget.value)}
					min="0"
					step="1"
				/>
			</div>
			<label
				class="min-h-12 gap-4 rounded-lg bg-surface-container px-3 py-2 flex cursor-pointer items-center justify-between"
			>
				<span class="text-sm">Between classes</span><span class="flex shrink-0"
					><Switch bind:checked={preferences.betweenClasses} /></span
				>
			</label>
			{#if preferences.betweenClasses}<p class="text-xs text-on-surface-variant">
					Only gaps between the group's earliest and latest classes each day.
				</p>{/if}
		</div>
	</details>
</section>
