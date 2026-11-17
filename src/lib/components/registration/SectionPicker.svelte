<script lang="ts">
	import { Icon } from 'm3-svelte';
	import iconStar from '@ktibow/iconset-material-symbols/star-rounded';
	import iconWarning from '@ktibow/iconset-material-symbols/warning-outline';
	import { userSettings } from '$lib/stores';
	import { meetingSummary, seatSummary } from '$lib/registration/builder';
	import { isLab } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import type { CatalogSection } from '$lib/registration/types';
	import SourceStatus from './SourceStatus.svelte';

	let {
		code,
		filters = [],
		onpicked
	}: {
		code: string;
		filters?: string[];
		onpicked?: () => void;
	} = $props();
	const plan = getRegistrationPlan();
	const id = $props.id();
	const military = $derived($userSettings?.military_time ?? true);
	const pick = $derived(plan.picks[code]);
	function allowed(section: CatalogSection) {
		if (filters.includes('open') && !(section.seats.available ?? 0)) return false;
		if (filters.includes('fridays') && section.meeting_times.some((m) => m.day === 'friday'))
			return false;
		if (filters.includes('late') && section.meeting_times.some((m) => m.begin_time < '10:00'))
			return false;
		return true;
	}
	const lectures = $derived(plan.lectures(code).filter(allowed));
	const allLabs = $derived(pick?.lecture ? plan.labsFor(pick.lecture) : []);
	const labs = $derived(allLabs.length > 1 ? allLabs.filter(allowed) : allLabs);
	const guessed = $derived(
		allLabs.length > 0 && plan.section(pick!.lecture!)?.linked.source !== 'banner'
	);
</script>

{#snippet option(section: CatalogSection, group: string, checked: boolean, onchange: () => void)}
	{@const overlaps = plan.overlaps(section, code)}
	{@const instructor = section.instructors[0]}
	{@const rating = instructor?.rmp?.avg_rating}
	<label
		class="gap-3 p-3 rounded-xl border-outline-variant has-checked:border-primary has-checked:bg-primary-container/40 has-focus-visible:outline-primary flex cursor-pointer items-start border has-focus-visible:outline-2"
	>
		<input
			type="radio"
			class="mt-1 accent-primary"
			name={`${id}-${group}`}
			{checked}
			onchange={() => {
				onchange();
			}}
		/>
		<span class="min-w-0 gap-0.5 flex flex-1 flex-col">
			<span class="gap-2 flex items-baseline justify-between">
				<span class="text-sm font-semibold"
					>{isLab(section) ? 'Lab' : 'Section'} {section.section_number}</span
				>
				<span class="text-xs text-on-surface-variant">CRN {section.crn}</span>
			</span>
			<span class="text-sm">{meetingSummary(section, military)}</span>
			<span class="text-xs text-on-surface-variant gap-x-2 flex flex-wrap items-center">
				<span>{instructor?.name ?? 'Staff'}</span>
				{#if rating !== null && rating !== undefined}<span class="gap-0.5 inline-flex items-center"
						><Icon icon={iconStar} size={14} />{rating.toFixed(1)}
						<span class="sr-only">Rate My Professors rating</span></span
					>{/if}
				<span>·</span>
				<span class:text-error={!section.seats.available}>{seatSummary(section)}</span>
			</span>
			{#if overlaps.length}<span class="mt-1 gap-1 text-xs text-error flex items-center"
					><Icon icon={iconWarning} size={14} />Overlaps {overlaps.join(', ')}</span
				>{/if}
		</span>
	</label>
{/snippet}

<SourceStatus sources={plan.published ? [plan.catalog] : []} label="Loading sections…">
	<div class="gap-2 flex flex-col">
		{#if !plan.published}
			<p class="m-0 text-sm text-on-surface-variant">
				Sections for {plan.termName} aren't posted yet.
			</p>
		{:else if !plan.lectures(code).length}
			<p class="m-0 text-sm text-on-surface-variant">No sections of {code} in {plan.termName}.</p>
		{:else if !lectures.length}
			<p class="m-0 text-sm text-on-surface-variant">No sections match these filters.</p>
		{/if}
		{#each lectures as section (section.crn)}
			{@render option(section, 'lecture', pick?.lecture === section.crn, () => {
				plan.pickLecture(code, section.crn);
				if (plan.labsFor(section.crn).length <= 1) onpicked?.();
			})}
		{/each}
		{#if allLabs.length > 1}
			<h4 class="m-0 mt-2 text-sm font-semibold">Choose a lab</h4>
			{#if !labs.length}<p class="m-0 text-sm text-on-surface-variant">
					No labs match these filters.
				</p>{/if}
			{#each labs as lab (lab.crn)}
				{@render option(lab, 'lab', pick?.lab === lab.crn, () => {
					plan.pickLab(code, lab.crn);
					onpicked?.();
				})}
			{/each}
		{:else if allLabs.length === 1}
			<p class="m-0 text-xs text-on-surface-variant">
				Includes lab {labs[0].section_number} · {meetingSummary(labs[0], military)} · CRN {labs[0]
					.crn}
			</p>
		{/if}
		{#if guessed}
			<p class="m-0 text-xs text-on-surface-variant">
				Banner hasn't confirmed which lab goes with this section. Check it in LeopardWeb.
			</p>
		{/if}
	</div>
</SourceStatus>
