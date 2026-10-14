<script lang="ts">
	import { formatTime, minutesTime } from '$lib/datetime';
	import type { ComparisonOwnerStrip } from '$lib/friends/comparison';
	import type { MinuteRange } from '$lib/friends/types';
	let {
		strips,
		start,
		end,
		militaryTime = false,
		maxRows
	}: MinuteRange & {
		strips: ComparisonOwnerStrip[];
		militaryTime?: boolean;
		maxRows?: number;
	} = $props();
	const visible = $derived(maxRows === undefined ? strips : strips.slice(0, maxRows));
	const time = (value: number) => formatTime(minutesTime(value), militaryTime);
	const percent = (value: number) =>
		Math.max(0, Math.min(100, ((value - start) / Math.max(1, end - start)) * 100));
</script>

<div class="owner-strips" aria-label="Busy time by person">
	{#each visible as strip (strip.ownerId)}<div
			class="strip-row"
			title={`${strip.name}: ${strip.intervals.map((interval) => `${time(interval.start)} - ${time(interval.end)}`).join(', ')}`}
		>
			<span class="owner-name">{strip.name}</span>
			<div
				class="strip-track"
				role="img"
				aria-label={`${strip.name} busy ${strip.intervals.map((interval) => `${time(interval.start)} to ${time(interval.end)}`).join(', ')}`}
			>
				{#each strip.intervals as interval (`${interval.start}-${interval.end}`)}<span
						class="strip-mark"
						style:left={`${percent(interval.start)}%`}
						style:width={`${percent(interval.end) - percent(interval.start)}%`}
						style:background={strip.color}
					></span>{/each}
			</div>
		</div>{/each}
	{#if visible.length < strips.length}<span class="more-owners"
			>+ {strips.length - visible.length} more</span
		>{/if}
</div>

<style>
	.owner-strips {
		display: grid;
		gap: 0.2rem;
		text-align: left;
		margin-top: 0.4rem;
		container-type: inline-size;
	}
	.strip-row {
		display: grid;
		grid-template-columns: minmax(0, 4.5rem) minmax(0, 1fr);
		gap: 0.35rem;
		align-items: center;
		font-size: 0.65rem;
		line-height: 0.8rem;
	}
	.owner-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.strip-track {
		height: 0.4rem;
		position: relative;
		border-radius: 0.15rem;
		background: rgb(var(--m3-scheme-outline-variant) / 0.45);
		overflow: hidden;
	}
	.strip-mark {
		position: absolute;
		height: 100%;
		border-radius: 0.1rem;
	}
	.more-owners {
		font-size: 0.65rem;
		line-height: 0.8rem;
	}
	@container (max-width: 8rem) {
		.strip-row {
			grid-template-columns: minmax(0, 1fr);
		}
		.owner-name {
			display: none;
		}
	}
</style>
