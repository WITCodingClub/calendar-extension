<script lang="ts">
	import { Icon, Layer } from 'm3-svelte';
	import iconLeft from '@ktibow/iconset-material-symbols/chevron-left';
	import iconRight from '@ktibow/iconset-material-symbols/chevron-right';
	import iconDown from '@ktibow/iconset-material-symbols/arrow-drop-down';

	let {
		currentView = $bindable(),
		focusedMonth = $bindable(),
		focusedYear = $bindable(),
		startYear,
		endYear,
		previousMonth,
		nextMonth
	}: {
		currentView: 'calendar' | 'year' | 'month';
		focusedMonth: number;
		focusedYear: number;
		startYear: number;
		endYear: number;
		previousMonth?: number;
		nextMonth?: number;
	} = $props();

	const yearClick = () => (currentView = currentView == 'calendar' ? 'year' : 'calendar');
	const monthClick = () => (currentView = currentView == 'calendar' ? 'month' : 'calendar');
	const getShortMonth = (month: number) =>
		new Date(0, month).toLocaleDateString(undefined, { month: 'short' });
</script>

<div class="m3-container" class:choosing={currentView != 'calendar'}>
	<div>
		<button
			type="button"
			class="arrow"
			aria-label="Previous month"
			disabled={previousMonth === undefined && focusedYear <= startYear}
			onclick={() => {
				if (previousMonth !== undefined) focusedMonth = previousMonth;
				else if (focusedYear > startYear) {
					focusedYear--;
					focusedMonth = 11;
				}
			}}
		>
			<Layer />
			<Icon icon={iconLeft} />
		</button>
		<button
			type="button"
			class="chooser m3-font-label-large"
			aria-label={`Choose month, ${new Date(0, focusedMonth).toLocaleDateString(undefined, { month: 'long' })}`}
			onclick={monthClick}
			disabled={currentView == 'year'}
		>
			<Layer />
			{getShortMonth(focusedMonth)}
			<Icon icon={iconDown} />
		</button>
		<button
			type="button"
			class="arrow"
			aria-label="Next month"
			disabled={nextMonth === undefined && focusedYear >= endYear}
			onclick={() => {
				if (nextMonth !== undefined) focusedMonth = nextMonth;
				else if (focusedYear < endYear) {
					focusedYear++;
					focusedMonth = 0;
				}
			}}
		>
			<Layer />
			<Icon icon={iconRight} />
		</button>
	</div>
	<div>
		<button
			type="button"
			class="arrow"
			aria-label="Previous year"
			disabled={focusedYear <= startYear}
			onclick={() => focusedYear--}
		>
			<Layer />
			<Icon icon={iconLeft} />
		</button>
		<button
			type="button"
			class="chooser m3-font-label-large"
			aria-label={`Choose year, ${focusedYear}`}
			onclick={yearClick}
			disabled={currentView == 'month' || startYear === endYear}
		>
			<Layer />
			{focusedYear}
			<Icon icon={iconDown} />
		</button>
		<button
			type="button"
			class="arrow"
			aria-label="Next year"
			disabled={focusedYear >= endYear}
			onclick={() => focusedYear++}
		>
			<Layer />
			<Icon icon={iconRight} />
		</button>
	</div>
</div>

<style>
	.m3-container {
		display: flex;
		height: 4rem;
		border-bottom: solid 1px transparent;
		flex-shrink: 0;
	}
	.m3-container > div {
		display: flex;
		flex: 1;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;

		background-color: transparent;
		color: rgb(var(--m3-scheme-on-surface-variant));
		border: none;
		padding: 0;
		cursor: pointer;
		position: relative;
	}
	button:disabled {
		cursor: auto;
		color: rgb(var(--m3-scheme-on-surface-variant) / 0.38);
	}

	.chooser {
		flex-grow: 1;
	}
	.chooser :global(svg) {
		width: 1.125rem;
		height: 1.125rem;
		margin-right: -0.25rem;
		margin-left: 0.5rem;
	}
	.arrow {
		width: 3rem;
	}
	.arrow :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
	}

	.choosing {
		border-color: rgb(var(--m3-scheme-outline-variant));
	}
	.choosing .arrow {
		display: none;
	}
</style>
