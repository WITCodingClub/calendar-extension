<script lang="ts">
	import { Button, Chip, ConnectedButtons, Dialog } from 'm3-svelte';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import ComparisonList from '$lib/components/friends/ComparisonList.svelte';
	import type { ComparisonGridEvent } from '$lib/friends/comparison';
	import { DAYS } from '$lib/calendar/days';
	import { userSettings } from '$lib/stores';
	import { meetingSummary, seatSummary } from '$lib/registration/builder';
	import { crnOf, sectionGrid } from '$lib/registration/grid';
	import { codeOf, isLab } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import type { CatalogSection } from '$lib/registration/types';

	let { sections }: { sections?: CatalogSection[] } = $props();
	const plan = getRegistrationPlan();
	const id = $props.id();
	const military = $derived($userSettings?.military_time ?? true);
	let display = $state<'calendar' | 'list'>('calendar');
	let day = $state('monday');
	let selected = $state<CatalogSection>();
	const shown = $derived(sections ?? plan.chosen);
	const grid = $derived(sectionGrid(plan.term, shown));
	const dates: Record<string, string> = {
		monday: '2024-01-01',
		tuesday: '2024-01-02',
		wednesday: '2024-01-03',
		thursday: '2024-01-04',
		friday: '2024-01-05'
	};

	function select(item: ComparisonGridEvent) {
		const crn = crnOf(item);
		const section = shown.find((entry) => entry.crn === crn) ?? plan.section(crn);
		if (section) selected = section;
	}
</script>

<ConnectedButtons>
	<input
		type="radio"
		name={`${id}-display`}
		id={`${id}-calendar`}
		checked={display === 'calendar'}
		onchange={() => (display = 'calendar')}
	/><Button for={`${id}-calendar`}>Calendar</Button>
	<input
		type="radio"
		name={`${id}-display`}
		id={`${id}-list`}
		checked={display === 'list'}
		onchange={() => (display = 'list')}
	/><Button for={`${id}-list`}>List</Button>
</ConnectedButtons>
{#if display === 'list'}
	<nav class="gap-2 flex flex-wrap" aria-label="Schedule day">
		{#each DAYS.slice(0, 5) as item (item.key)}<Chip
				variant="general"
				selected={day === item.key}
				aria-pressed={day === item.key}
				onclick={() => (day = item.key)}>{item.label.slice(0, 3)}</Chip
			>{/each}
	</nav>
	<ComparisonList
		showDates={false}
		events={grid.stacked.byDay[day] ?? []}
		date={dates[day]}
		militaryTime={military}
		onselect={select}
	/>
{:else}
	<CalendarGrid
		stackedMeetings={grid.stacked}
		latestHour={grid.latest}
		startHour={8}
		militaryTime={military}
		onselect={select}
	/>
{/if}

{#if selected}
	<Dialog
		bind:open={
			() => Boolean(selected),
			(open) => {
				if (!open) selected = undefined;
			}
		}
		headline={`${codeOf(selected)} ${isLab(selected) ? 'lab' : 'section'} ${selected.section_number}`}
		role="dialog"
		aria-label="Section details"
		closedby="closerequest"
	>
		{#snippet buttons()}
			<Button variant="text" onclick={() => (selected = undefined)}>Close</Button>
		{/snippet}
		<div class="gap-3 min-w-0 flex flex-col break-words">
			<h3 class="text-lg font-medium">{selected.title}</h3>
			<p><strong>CRN:</strong> {selected.crn}</p>
			<p><strong>Time:</strong> {meetingSummary(selected, military)}</p>
			<p>
				<strong>Location:</strong>
				{selected.meeting_times[0]?.location?.display ?? 'Not provided'}
			</p>
			<p><strong>Instructor:</strong> {selected.instructors[0]?.name ?? 'Staff'}</p>
			<p><strong>Seats:</strong> {seatSummary(selected)}</p>
		</div>
	</Dialog>
{/if}
