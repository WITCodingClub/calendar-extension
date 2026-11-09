<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Layer } from 'm3-svelte';
	import { todayDate } from '$lib/datetime';
	import { validDate } from '$lib/friends/schedule';
	import Header from './Header.svelte';
	import FocusPicker from './FocusPicker.svelte';

	const today = todayDate();
	const currentYear = Number(today.slice(0, 4));
	let {
		date = '',
		year,
		startYear = Math.max(1, currentYear - 50),
		endYear = Math.min(9999, currentYear + 5),
		clearable = false,
		dateValidator = () => true,
		close,
		setDate
	}: {
		date?: string;
		year: number;
		startYear?: number;
		endYear?: number;
		clearable?: boolean;
		dateValidator?: (date: string) => boolean;
		close: () => void;
		setDate: (date: string) => void;
	} = $props();

	let currentView = $state<'calendar' | 'month' | 'year'>('calendar');
	let focusedYear = $state(untrack(() => year));
	let focusedMonth = $state(
		untrack(() => (validDate(date) ? Number(date.slice(5, 7)) - 1 : Number(today.slice(5, 7)) - 1))
	);
	let chosenDate = $derived(date);
	const prefix = (month: number) =>
		`${String(focusedYear).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
	function monthEnabled(year: number, month: number) {
		return Array.from(
			{ length: 31 },
			(_, day) =>
				`${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`
		).some((date) => validDate(date) && dateValidator(date));
	}
	const months = $derived(
		Array.from({ length: 12 }, (_, month) => {
			const start = `${prefix(month)}-01`;
			return {
				month,
				name: new Date(`${start}T00:00:00Z`).toLocaleDateString(undefined, {
					month: 'long',
					timeZone: 'UTC'
				}),
				enabled: monthEnabled(focusedYear, month)
			};
		})
	);
	const previousMonth = $derived(months.slice(0, focusedMonth).findLast((month) => month.enabled));
	const nextMonth = $derived(months.slice(focusedMonth + 1).find((month) => month.enabled));
	const selectionValid = $derived(
		chosenDate ? validDate(chosenDate) && dateValidator(chosenDate) : clearable
	);

	$effect(() => {
		if (!months[focusedMonth].enabled) {
			const available = months.find((month) => month.enabled);
			if (available) focusedMonth = available.month;
		}
	});

	function makeCalendar(month: number) {
		const start = `${prefix(month)}-01`;
		const firstDay = new Date(`${start}T00:00:00Z`);
		return Array.from({ length: 42 }, (_, index) => {
			const iso = new Date(firstDay.getTime() + (index - firstDay.getUTCDay()) * 86400000)
				.toISOString()
				.split('T')[0];
			return {
				iso,
				day: Number(iso.slice(-2)),
				disabled: iso.slice(0, 7) !== prefix(month) || !dateValidator(iso)
			};
		});
	}
</script>

<div class="m3-container">
	<Header
		bind:currentView
		bind:focusedMonth
		bind:focusedYear
		{startYear}
		{endYear}
		previousMonth={previousMonth?.month}
		nextMonth={nextMonth?.month}
	/>
	{#if currentView === 'calendar'}
		<div class="calendar" role="group" aria-label="Days">
			{#each 'SMTWTFS' as day, index (index)}
				<div class="day m3-font-body-small">{day}</div>
			{/each}
			{#each makeCalendar(focusedMonth) as day (day.iso)}
				<button
					type="button"
					class="item m3-font-body-small"
					disabled={day.disabled}
					class:today={day.iso === today}
					class:selected={day.iso === chosenDate}
					aria-label={day.iso}
					aria-pressed={day.iso === chosenDate}
					onclick={() => (chosenDate = day.iso)}
				>
					<Layer />
					{day.day}
				</button>
			{/each}
		</div>
		<div class="actions">
			{#if clearable}
				<span class="clear"
					><Button variant="text" onclick={() => (chosenDate = '')}>Clear</Button></span
				>
			{/if}
			<Button variant="text" onclick={close}>Cancel</Button>
			<Button
				variant="text"
				disabled={!selectionValid}
				onclick={() => {
					if (!selectionValid) return;
					setDate(chosenDate);
					close();
				}}>OK</Button
			>
		</div>
	{:else if currentView === 'month'}
		<FocusPicker
			label="Months"
			options={months.map((month) => ({
				name: month.name,
				selected: month.month === focusedMonth,
				disabled: !month.enabled,
				activate: () => {
					focusedMonth = month.month;
					currentView = 'calendar';
				}
			}))}
		/>
	{:else}
		<FocusPicker
			label="Years"
			options={Array.from({ length: endYear - startYear + 1 }, (_, index) => {
				const year = startYear + index;
				return {
					name: String(year),
					selected: year === focusedYear,
					activate: () => {
						focusedYear = year;
						currentView = 'calendar';
					}
				};
			})}
		/>
	{/if}
</div>

<style>
	.m3-container {
		display: flex;
		position: relative;
		overflow: hidden;
		flex-direction: column;
		background-color: rgb(var(--m3-scheme-surface-container-high));
		width: 20.5rem;
		height: 26.75rem;
		max-width: 100%;
		border-radius: var(--m3-date-picker-shape, var(--m3-util-rounding-large));
	}
	.calendar {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		padding: 0 0.75rem 0.25rem;
		gap: 0.25rem;
	}
	.day,
	.item {
		display: inline-flex;
		width: 100%;
		max-width: 2.5rem;
		aspect-ratio: 1;
		border-radius: 2.5rem;
		align-items: center;
		justify-content: center;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.item {
		background-color: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		position: relative;
	}
	.item:disabled {
		color: rgb(var(--m3-scheme-on-surface-variant) / 0.38);
		cursor: auto;
	}
	.item.today {
		border: solid 1px rgb(var(--m3-scheme-primary));
		color: rgb(var(--m3-scheme-primary));
	}
	.item.selected {
		background-color: rgb(var(--m3-scheme-primary));
		color: rgb(var(--m3-scheme-on-primary));
	}
	.actions {
		display: flex;
		padding: 0.5rem 0.75rem;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	.clear {
		margin-right: auto;
	}
</style>
