<script lang="ts">
	import { Icon } from 'm3-svelte';
	import { KINDS } from '$lib/registration/progress';
	import type { RegistrationPlan } from '$lib/registration/plan.svelte';
	import type { HssCategory, HssProgress } from '$lib/registration/types';

	let { plan, hss }: { plan: RegistrationPlan; hss: HssProgress } = $props();
	const min = $derived(hss.min_credits);
	const english = $derived(hss.english.credits);
	const pct = (value: number) =>
		`${Math.min(100, (value / Math.max(min ?? hss.credits, 1)) * 100)}%`;

	function scheduledFor(name: string) {
		for (const term of plan.termOptions) {
			for (const code of plan.byTerm[term.uid]?.added ?? []) {
				if (hss.courses.some((course) => course.code === code)) continue;
				const option = plan.option(code, term.uid);
				if (option.hssCategory === name) return { code, title: option.title, term: term.name };
			}
		}
		return undefined;
	}

	function hint(category: HssCategory) {
		if (!category.hint) return '';
		if (category.hint.courses.length) return category.hint.courses.join(', ');
		const codes = category.hint.subject_codes;
		return codes.length > 4 ? `${codes.slice(0, 4).join(', ')}, and more` : codes.join(', ');
	}

	function side(category: HssCategory, scheduled?: { code: string }) {
		if (category.course) return category.course;
		if (scheduled) return scheduled.code;
		if (!category.checkable) return "Can't check";
		const slot = hss.open_slots.find(
			(entry) => entry.hss_category === category.name && entry.planned_term
		);
		return slot ? `Planned ${slot.planned_term}` : 'Still needed';
	}
</script>

<section class="gap-3 rounded-2xl bg-surface-container-low p-4 flex flex-col">
	<div class="gap-2 flex items-baseline justify-between">
		<h2 class="m-0 text-sm font-bold text-on-surface">Humanities and social science</h2>
		<span class="text-xs text-on-surface-variant shrink-0"
			>{min ? `${hss.credits} of ${min} credits` : `${hss.credits} credits`}</span
		>
	</div>
	<div class="gap-1 flex flex-col">
		<div
			class="h-2 bg-surface-container-highest flex overflow-hidden rounded-full"
			role="img"
			aria-label={`${english} English credits and ${hss.credits - english} HSS credits${min ? ` of ${min}` : ''}`}
		>
			<span class="bg-secondary" style:width={pct(english)}></span>
			<span class="bg-primary" style:width={pct(hss.credits - english)}></span>
		</div>
		<p class="m-0 gap-x-3 text-xs text-on-surface-variant flex flex-wrap">
			<span><span class="dot bg-secondary"></span>English {english}</span>
			<span><span class="dot bg-primary"></span>HSS {hss.credits - english}</span>
			{#if min}<span>{Math.max(0, min - hss.credits)} to go</span>{/if}
		</p>
	</div>

	<ul class="m-0 p-0 divide-outline-variant/60 list-none divide-y">
		{#each hss.categories as category (category.name)}
			{@const taken = hss.courses.find((course) => course.code === category.course)}
			{@const scheduled =
				!taken && category.status === 'open' ? scheduledFor(category.name) : undefined}
			{@const k =
				category.status === 'done'
					? 'done'
					: category.status === 'in_progress'
						? 'now'
						: scheduled
							? 'scheduled'
							: 'later'}
			<li class="gap-3 py-2 flex items-start">
				<span class="icon {k} mt-0.5 inline-flex shrink-0"
					><Icon icon={KINDS[k].icon} size={18} /></span
				>
				<div class="min-w-0 flex-1">
					<div class="gap-2 flex items-baseline justify-between">
						<span class="text-sm text-on-surface">{category.name}</span>
						<span class="text-xs text-on-surface-variant shrink-0">{side(category, scheduled)}</span
						>
					</div>
					{#if taken || scheduled || hint(category)}
						<p class="m-0 text-xs text-on-surface-variant">
							{taken
								? `${taken.title} · ${taken.status === 'done' ? 'done' : 'taking now'}`
								: scheduled
									? `${scheduled.title} · in your ${scheduled.term} schedule`
									: hint(category)}
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if hss.open_slots.length}
		<div class="gap-1.5 flex flex-col">
			<p class="m-0 text-xs font-medium text-on-surface-variant">
				HSS electives still in your plan
			</p>
			<div class="gap-1.5 flex flex-wrap">
				{#each hss.open_slots as slot, index (index)}
					<span class="rounded-lg bg-surface-container-high px-2 py-1 text-xs text-on-surface"
						>{[slot.planned_term ?? slot.label, slot.hss_category]
							.filter(Boolean)
							.join(' · ')}</span
					>
				{/each}
			</div>
		</div>
	{/if}
</section>

<style>
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		display: inline-block;
		margin-right: 0.3rem;
	}
	.icon.done,
	.icon.scheduled {
		color: rgb(var(--m3-scheme-primary));
	}
	.icon.now {
		color: rgb(var(--m3-scheme-tertiary));
	}
	.icon.later {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
</style>
