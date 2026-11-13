<script lang="ts">
	import { fitsIn } from '$lib/registration/progress';
	import type { RegistrationPlan } from '$lib/registration/plan.svelte';
	import type { DegreeProgram } from '$lib/registration/types';

	let { plan, program }: { plan: RegistrationPlan; program: DegreeProgram } = $props();
	const total = $derived(program.summary.total_credits ?? 0);
	const earned = $derived(program.summary.credits.earned);
	const now = $derived(program.summary.credits.in_progress);
	const coOps = $derived(program.summary.co_ops);
	const school = $derived(program.school ?? program.summary.school);
	const planned = $derived(
		plan.termOptions
			.map((term) => ({ name: term.name, credits: termCredits(term.uid) }))
			.filter((term) => term.credits > 0)
	);
	const scheduled = $derived(planned.reduce((sum, term) => sum + term.credits, 0));
	const scheduledIn = $derived(planned.map((term) => term.name).join(' and '));
	const fits = $derived(fitsIn(program.overlap, plan.programs));
	const minor = $derived(/\bminor\b/i.test(program.name));
	const pct = (value: number) => `${Math.min(100, (value / Math.max(total, 1)) * 100)}%`;

	function termCredits(uid: string) {
		const picks = plan.byTerm[uid];
		if (!picks) return 0;
		const sections = plan.sources[uid]?.sections() ?? [];
		return picks.added.reduce((sum, code) => {
			const lecture = picks.picks[code]?.lecture;
			if (!lecture) return sum;
			const section = sections.find((entry) => entry.crn === lecture);
			return sum + (section?.credit_hours ?? plan.option(code, uid).credits ?? 0);
		}, 0);
	}
</script>

{#if program.status !== 'planned'}
	<section class="gap-3 rounded-2xl bg-surface-container p-4 flex flex-col">
		<div>
			<h2 class="m-0 text-base font-bold text-on-surface">{program.name}</h2>
			<p class="m-0 text-xs text-on-surface-variant">
				{[school, `${program.catalog_year} catalog`, program.plan].filter(Boolean).join(' · ')}
			</p>
		</div>
		{#if total}
			<div class="gap-1.5 flex flex-col">
				<p class="m-0 text-on-surface">
					<span class="text-2xl font-bold">{earned}</span>
					<span class="text-sm text-on-surface-variant"> of {total} credits earned</span>
				</p>
				<div
					class="h-2.5 bg-surface-container-highest flex overflow-hidden rounded-full"
					role="img"
					aria-label={`${earned} earned, ${now} in progress, ${scheduled} in your ${scheduledIn || plan.termName} schedule, of ${total}`}
				>
					<span class="bg-primary" style:width={pct(earned)}></span>
					<span class="bg-tertiary" style:width={pct(now)}></span>
					<span class="bg-primary/40" style:width={pct(scheduled)}></span>
				</div>
				<p class="m-0 gap-x-3 text-xs text-on-surface-variant flex flex-wrap">
					<span><span class="dot bg-primary"></span>{earned} earned</span>
					<span><span class="dot bg-tertiary"></span>{now} taking now</span>
					{#if scheduled}<span
							><span class="dot bg-primary/40"></span>{scheduled} in {scheduledIn}</span
						>{/if}
				</p>
			</div>
		{/if}
		<div class="gap-2 grid grid-cols-3">
			<div class="rounded-xl bg-surface-container-low p-2.5">
				<p class="m-0 text-on-surface-variant text-[0.6875rem]">Courses left</p>
				<p class="m-0 text-sm font-semibold text-on-surface">{program.counts.open}</p>
			</div>
			<div class="rounded-xl bg-surface-container-low p-2.5">
				<p class="m-0 text-on-surface-variant text-[0.6875rem]">Co-ops</p>
				<p class="m-0 text-sm font-semibold text-on-surface">
					{coOps.required ? `${coOps.done} of ${coOps.required}` : '—'}
				</p>
			</div>
			<div class="rounded-xl bg-surface-container-low p-2.5">
				<p class="m-0 text-on-surface-variant text-[0.6875rem]">Finish around</p>
				<p class="m-0 text-sm font-semibold text-on-surface">{program.expected_end?.term ?? '—'}</p>
			</div>
		</div>
	</section>
{:else}
	<section class="gap-3 rounded-2xl bg-surface-container p-4 flex flex-col">
		<div>
			<h2 class="m-0 text-base font-bold text-on-surface">{program.name}</h2>
			<p class="m-0 text-xs text-on-surface-variant">
				{[school, `${program.catalog_year} catalog`].filter(Boolean).join(' · ')}
			</p>
		</div>
		{#if program.overlap}
			<p class="m-0 text-on-surface">
				<span class="text-2xl font-bold">+{program.overlap.extra}</span>
				<span class="text-sm text-on-surface-variant">
					{program.overlap.extra === 1 ? 'course' : 'courses'} beyond your major</span
				>
			</p>
			<div class="gap-2 grid {fits ? 'grid-cols-3' : 'grid-cols-2'}">
				<div class="rounded-xl bg-surface-container-low p-2.5">
					<p class="m-0 text-on-surface-variant text-[0.6875rem]">Credits</p>
					<p class="m-0 text-sm font-semibold text-on-surface">{program.total_credits ?? '—'}</p>
				</div>
				<div class="rounded-xl bg-surface-container-low p-2.5">
					<p class="m-0 text-on-surface-variant text-[0.6875rem]">Shared</p>
					<p class="m-0 text-sm font-semibold text-on-surface">
						{program.overlap.shared}
						{program.overlap.shared === 1 ? 'course' : 'courses'}
					</p>
				</div>
				{#if fits}
					<div class="rounded-xl bg-surface-container-low p-2.5">
						<p class="m-0 text-on-surface-variant text-[0.6875rem]">Fits in</p>
						<p class="m-0 text-sm font-semibold text-on-surface">{fits.text}</p>
					</div>
				{/if}
			</div>
		{/if}
		<p class="m-0 text-xs text-on-surface-variant">
			You added this {minor ? 'minor' : 'program'} in WIT Calendar. It isn't declared with Wentworth.
		</p>
	</section>
{/if}

<style>
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		display: inline-block;
		margin-right: 0.3rem;
	}
</style>
