<script lang="ts">
	import { Button, Icon } from 'm3-svelte';
	import iconPrev from '@ktibow/iconset-material-symbols/chevron-left-rounded';
	import iconNext from '@ktibow/iconset-material-symbols/chevron-right-rounded';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import type { FinderResult } from '$lib/registration/finder.svelte';
	import ScheduleView from './ScheduleView.svelte';

	let {
		result,
		onchange,
		onuse
	}: { result: FinderResult; onchange: () => void; onuse: () => void } = $props();
	const plan = getRegistrationPlan();
	const index = $derived(Math.min(plan.previewIndex ?? 0, result.candidates.length - 1));
	const candidate = $derived(result.candidates[index]);
	const sectionsLine = $derived(
		candidate.codes
			.map((code) => {
				const pick = candidate.picks[code];
				const lecture = candidate.sections.find((s) => s.crn === pick?.lecture);
				const lab = candidate.sections.find((s) => s.crn === pick?.lab);
				return `${code}-${lecture?.section_number ?? '?'}${lab ? ` + ${lab.section_number}` : ''}`;
			})
			.join(', ')
	);
</script>

<section class="gap-2 rounded-2xl bg-surface-container p-4 flex flex-col">
	<div class="gap-2 flex items-center justify-between">
		<Button
			variant="text"
			iconType="full"
			aria-label="Previous schedule"
			disabled={index === 0}
			onclick={() => (plan.previewIndex = index - 1)}><Icon icon={iconPrev} /></Button
		>
		<div class="min-w-0 text-center" role="status">
			<h2 class="m-0 text-base font-bold text-on-surface">
				{index === 0 ? 'Best match' : `Option ${index + 1}`}
				<span class="text-sm font-normal text-on-surface-variant">
					· {index + 1} of {result.candidates.length}</span
				>
			</h2>
			<p class="m-0 text-xs text-on-surface-variant">
				{candidate.credits} credits{result.total > result.candidates.length
					? ` · ${result.capped ? `${result.total}+` : result.total} schedules fit in total`
					: ''}
			</p>
		</div>
		<Button
			variant="text"
			iconType="full"
			aria-label="Next schedule"
			disabled={index === result.candidates.length - 1}
			onclick={() => (plan.previewIndex = index + 1)}><Icon icon={iconNext} /></Button
		>
	</div>
	<div class="gap-1.5 flex flex-wrap justify-center">
		{#each candidate.highlights as highlight (highlight)}
			<span
				class="px-2.5 py-0.5 text-xs rounded-full"
				class:bg-secondary-container={!highlight.includes('avoid')}
				class:text-on-secondary-container={!highlight.includes('avoid')}
				class:bg-tertiary-container={highlight.includes('avoid')}
				class:text-on-tertiary-container={highlight.includes('avoid')}>{highlight}</span
			>
		{/each}
	</div>
	<p class="m-0 text-xs text-on-surface-variant text-center">{sectionsLine}</p>
	{#if result.notOffered.length}
		<p class="m-0 text-xs text-error text-center">
			Not offered this term: {result.notOffered.join(', ')}
		</p>
	{/if}
	<div class="gap-2 flex flex-wrap justify-end">
		<Button variant="text" onclick={onchange}>Change preferences</Button>
		<Button onclick={onuse}>Use this schedule</Button>
	</div>
</section>
<ScheduleView sections={candidate.sections} />
