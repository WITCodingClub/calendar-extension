<script lang="ts">
	import { CALENDAR_ICON } from '$lib/icons';
	import { on } from 'svelte/events';
	import { DAYS } from '$lib/calendar/days';
	import type { CalendarGridEvent } from '$lib/calendar/layout';
	import { formatTime, minutesTime } from '$lib/datetime';
	import type { DayItem } from '$lib/types';
	let {
		stackedMeetings,
		latestHour,
		startHour = 8,
		militaryTime = true,
		earliestClassOffsetRem = 0,
		focusOffsetRem,
		dates,
		onselect
	}: {
		stackedMeetings: { byDay: Record<string, CalendarGridEvent[]> };
		latestHour: number;
		startHour?: number;
		militaryTime?: boolean;
		earliestClassOffsetRem?: number;
		focusOffsetRem?: number;
		dates?: string[];
		onselect: (item: CalendarGridEvent, day: DayItem) => void;
	} = $props();
	const hours = $derived(
		Array.from({ length: latestHour - startHour + 1 }, (_, index) => index + startHour)
	);
	const stackGapPct = 2;

	function scrollToFirstClass(startOffsetRem: number) {
		return (el: HTMLElement) => {
			const frame = requestAnimationFrame(() => {
				const rem = parseFloat(getComputedStyle(el).fontSize) || 16;
				if (focusOffsetRem === undefined && el.clientWidth < 20 * rem) return;
				const bufferRem = 2;
				if (startOffsetRem <= bufferRem) {
					el.scrollLeft = 0;
					return;
				}
				el.scrollLeft = (startOffsetRem - bufferRem) * rem;
			});
			return () => cancelAnimationFrame(frame);
		};
	}

	function horizontalWheel(el: HTMLElement) {
		let lastWheelAt = 0;
		let lockVertical = false;
		return on(
			el,
			'wheel',
			(e) => {
				if (el.scrollWidth <= el.clientWidth) return;
				if (e.deltaY === 0 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

				const now = performance.now();
				if (now - lastWheelAt > 40) lockVertical = false;
				lastWheelAt = now;

				const root = document.scrollingElement ?? document.documentElement;
				const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
				if (!atBottom || (e.deltaY < 0 && el.scrollLeft <= 1)) {
					lockVertical = true;
					return;
				}
				if (lockVertical) return;

				e.preventDefault();
				el.scrollLeft += e.deltaY;
			},
			{ passive: false }
		);
	}
</script>

<div
	class="min-w-0 min-h-48 rounded-2xl bg-surface-container-low @container flex w-full flex-1 flex-col overflow-hidden shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.1)]"
>
	<div
		class="flex-1 overflow-x-auto overflow-y-hidden"
		{@attach scrollToFirstClass(focusOffsetRem ?? earliestClassOffsetRem)}
		{@attach horizontalWheel}
	>
		<div class="inline-flex h-full min-w-full flex-col">
			<div
				class="border-outline-variant bg-surface-container-high top-0 sticky z-30 flex flex-row border-b"
			>
				<div
					class="w-24 left-0 border-outline-variant bg-surface-container-high sticky z-20 shrink-0 border-r @max-[20rem]:static"
				></div>
				{#each hours as hour (hour)}
					<div class="w-32 border-outline-variant py-2 flex items-center justify-center border-r">
						<span class="text-xs text-on-surface-variant"
							>{formatTime(minutesTime(hour * 60), militaryTime)}</span
						>
					</div>
				{/each}
			</div>

			{#each DAYS.slice(0, 5) as day (day.key)}
				{@const dayEvents = stackedMeetings.byDay?.[day.key] ?? []}
				{@const lanes = Math.max(1, ...dayEvents.map((item) => item.overlapCount))}
				{@const rowHeight = Math.max(120, lanes * 56 + (lanes + 1) * 4)}
				<div
					class="border-outline-variant relative flex min-h-[120px] flex-1 flex-row border-b"
					style:min-height={`${rowHeight}px`}
				>
					<div
						class="w-24 left-0 border-outline-variant bg-secondary-container text-on-secondary-container sticky z-20 flex shrink-0 items-center justify-center border-r @max-[20rem]:static"
					>
						<div class="text-center">
							<span class="font-semibold text-sm">{day.label}</span>
							{#if dates?.[day.order]}<span class="mt-1 text-xs block"
									>{new Date(`${dates[day.order]}T00:00:00Z`).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										timeZone: 'UTC'
									})}</span
								>{/if}
						</div>
					</div>

					<div class="relative flex flex-1">
						{#each hours as hour (hour)}
							<div class="w-32 border-outline-variant border-r"></div>
						{/each}

						{#each dayEvents as item (`${item.ownerId ?? 'you'}:${item.meeting.id}`)}
							{@const overlapCount = Math.max(item.overlapCount ?? 1, 1)}
							{@const gapPct = Math.min(stackGapPct, 400 / rowHeight)}
							{@const heightPct = Math.max((100 - (overlapCount + 1) * gapPct) / overlapCount, 0)}
							{@const topPct = gapPct + item.stackIndex * (heightPct + gapPct)}
							{@const rooms = (item.meeting.location?.rooms ?? []).filter(Boolean).join(' / ')}
							{@const buildingAbbr = item.meeting.location?.building?.abbreviation ?? ''}
							<button
								class="rounded px-2 py-1 text-xs hover:shadow-md absolute cursor-pointer overflow-hidden border-t-2 transition-shadow"
								class:outline-2={item.preview}
								class:outline-dashed={item.preview}
								class:outline-primary={item.preview}
								aria-label={item.preview
									? `Planned meeting, ${day.label}, ${formatTime(item.meeting.begin_time, militaryTime)}–${formatTime(item.meeting.end_time, militaryTime)}`
									: undefined}
								title={item.preview
									? `Planned meeting · ${formatTime(item.meeting.begin_time, militaryTime)}–${formatTime(item.meeting.end_time, militaryTime)}`
									: undefined}
								style={`background-color:${item.bgColor}; color:${item.textColor}; left:${item.startOffset}rem; width:${item.width}rem; top:${topPct}%; height:${heightPct}%; border-color:${item.bgColor};`}
								onclick={() => onselect(item, day)}
							>
								{#if item.preview}
									<svg aria-hidden="true" class="h-5 w-5 mx-auto shrink-0" viewBox="0 0 24 24"
										><path fill="currentColor" d={CALENDAR_ICON} /></svg
									>
								{:else}
									<div class="font-medium truncate">
										{item.ownerLabel ? `${item.ownerLabel} · ` : ''}{item.meeting.title_overrides?.[
											day.key
										] ?? item.course.title}
									</div>
									<div class="opacity-80">
										{formatTime(item.meeting.begin_time, militaryTime)} - {formatTime(
											item.meeting.end_time,
											militaryTime
										)}
									</div>
									<div class="text-[10px] whitespace-nowrap opacity-70">
										{[buildingAbbr, rooms].filter(Boolean).join(' - ')}
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
