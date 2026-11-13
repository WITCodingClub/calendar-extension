<script lang="ts">
	import { Button, ConnectedButtons, Icon } from 'm3-svelte';
	import iconExpand from '@ktibow/iconset-material-symbols/expand-more';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ProgramCard from './ProgramCard.svelte';
	import HssCard from './HssCard.svelte';
	import MinorCard from './MinorCard.svelte';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import {
		KINDS,
		chipLabel,
		explain,
		kindOf,
		missedByTerm,
		sortedPrograms,
		termsOf,
		title,
		type Kind,
		type TermEntry
	} from '$lib/registration/progress';
	import type { DegreeProgram } from '$lib/registration/types';

	const plan = getRegistrationPlan();
	const id = $props.id();
	const programs = $derived(sortedPrograms(plan.programs));
	let selected = $state<string | null>(null);
	let focus = $state<string | null>(null);
	let open = $state<Record<string, boolean>>({});
	let showMissed = $state(false);
	const program = $derived(programs.find((entry) => entry.program === selected) ?? programs[0]);
	const terms = $derived(termsOf(program, plan));
	const missedGroups = $derived(
		missedByTerm(program)
			.map((group) => ({ ...group, rows: group.rows.filter((row) => !plan.scheduled(row)) }))
			.filter((group) => group.rows.length)
	);
	const missed = $derived(missedGroups.flatMap((group) => group.rows));
	const missedTerms = $derived(missedGroups.flatMap((group) => (group.term ? [group.term] : [])));
	const one = $derived(missed.length === 1);
	const missedTitle = $derived(
		`${missed.length} ${one ? 'course' : 'courses'}${missedTerms.length ? ` from ${missedTerms.join(' and ')}` : ''} not taken`
	);
	const firstEstimate = $derived(terms.find((term) => term.estimated)?.term);
	const allOpen = $derived(terms.every((term) => expanded(term)));

	function label(entry: DegreeProgram) {
		const name = entry.name.trim();
		const prefix = /^minor in\s+/i;
		const suffix = /,?\s+minor$/i;
		if (prefix.test(name)) return `${name.replace(prefix, '')} minor`;
		if (suffix.test(name)) return `${name.replace(suffix, '')} minor`;
		const majors = programs.filter(
			(other) => other.status === 'active' && !/\bminor\b/i.test(other.name)
		);
		return entry.status === 'active' && majors.length === 1 ? 'Major' : name;
	}

	function expanded(term: TermEntry) {
		return open[term.term] ?? (term.when === 'current' || term.when === 'registering');
	}

	function summary(term: TermEntry) {
		const list = term.rows.map((row) => kindOf(plan, row, term));
		const count = (k: Kind) => list.filter((entry) => entry === k).length;
		if (term.co_op) return 'Co-op';
		if (term.when === 'registering')
			return `${count('scheduled')} of ${list.length} in your schedule`;
		if (term.when === 'current') return `Taking ${count('now')}`;
		if (term.when === 'past')
			return count('behind')
				? `${count('done')} of ${list.length} done`
				: `All ${list.length} done`;
		return `${list.length} ${list.length === 1 ? 'course' : 'courses'}`;
	}

	async function toCourses() {
		plan.stage = 'plan';
		plan.step = null;
		await goto(resolve('/registration'));
		window.scrollTo({ top: 0 });
	}
</script>

{#snippet chip(k: Kind, label: string, pressed: boolean, onclick: () => void)}
	<button
		type="button"
		class="chip {k} gap-1 rounded-lg py-1 pl-1.5 pr-2 text-xs font-medium inline-flex cursor-pointer items-center"
		class:ring={pressed}
		aria-pressed={pressed}
		aria-label={`${label}: ${KINDS[k].label}`}
		{onclick}><Icon icon={KINDS[k].icon} size={14} />{label}</button
	>
{/snippet}

{#if programs.length > 1}
	<div class="min-w-0 [&>.m3-container]:flex! [&>.m3-container]:flex-wrap!">
		<ConnectedButtons>
			{#each programs as entry (entry.program)}
				<input
					type="radio"
					name={`${id}-program`}
					id={`${id}-${entry.program}`}
					value={entry.program}
					checked={entry.program === program.program}
					onchange={() => {
						selected = entry.program;
						focus = null;
					}}
				/>
				<Button for={`${id}-${entry.program}`}>{label(entry)}</Button>
			{/each}
		</ConnectedButtons>
	</div>
{/if}

<ProgramCard {plan} {program} />

{#if missed.length}
	<section class="gap-2 rounded-2xl bg-surface-container-low p-4 flex flex-col">
		<button
			type="button"
			class="head gap-2 text-sm font-bold text-error p-0 flex w-full cursor-pointer items-center border-0 bg-transparent text-left"
			aria-expanded={showMissed}
			onclick={() => (showMissed = !showMissed)}
		>
			<Icon icon={KINDS.behind.icon} size={18} />
			<span class="min-w-0 flex-1">{missedTitle}</span>
			<span class="chev text-on-surface-variant shrink-0" class:rotate-180={showMissed}
				><Icon icon={iconExpand} size={18} /></span
			>
		</button>
		{#if showMissed}
			<p class="m-0 text-xs text-on-surface-variant">
				Your plan put {one ? 'this' : 'these'} in an earlier term. Fit {one ? 'it' : 'them'} into {plan.termName}
				or a later term to stay on track.
			</p>
			<ul class="m-0 pl-5 text-sm text-on-surface">
				{#each missed as row, index (index)}<li>{title(row)}</li>{/each}
			</ul>
			<div class="flex justify-end">
				<Button variant="tonal" onclick={toCourses}>Add to {plan.termName}</Button>
			</div>
		{/if}
	</section>
{/if}

{#if terms.length}
	<section class="rounded-2xl bg-surface-container-low px-3 py-2 flex flex-col">
		<div class="gap-2 px-1 py-1 flex items-center justify-between">
			<h2 class="m-0 text-sm font-bold text-on-surface">Plan by term</h2>
			<button
				type="button"
				class="text-xs font-medium text-primary p-0 cursor-pointer border-0 bg-transparent"
				onclick={() => (open = Object.fromEntries(terms.map((term) => [term.term, !allOpen])))}
				>{allOpen ? 'Collapse all' : 'Expand all'}</button
			>
		</div>
		<ol class="m-0 p-0 list-none">
			{#each terms as term, index (term.term)}
				{@const isOpen = expanded(term)}
				{@const focused = term.rows.find((_, row) => focus === `${term.term}:${row}`)}
				{@const behind = term.rows.some((row) => kindOf(plan, row, term) === 'behind')}
				{#if term.term === firstEstimate}
					<li class="gap-2 py-1.5 pl-6 text-xs text-on-surface-variant flex items-center">
						<span class="w-3 border-outline-variant h-px shrink-0 border-t border-dashed"></span>
						<span class="min-w-0"
							>Estimated from here. Co-ops and summer classes can move terms.</span
						>
					</li>
				{/if}
				<li class="gap-2.5 flex">
					<div class="w-3.5 flex shrink-0 flex-col items-center">
						<span class="w-0.5 h-3 {index ? 'line' : ''}" class:dashed={term.estimated}></span>
						<span
							class="node {term.when}"
							class:behind
							class:coop={term.co_op}
							class:estimate={term.estimated}
						></span>
						<span
							class="w-0.5 flex-1 {index < terms.length - 1 ? 'line' : ''}"
							class:dashed={terms[index + 1]?.estimated}
						></span>
					</div>
					<div class="min-w-0 pb-1 flex-1">
						<button
							type="button"
							class="head gap-2 py-1.5 p-0 flex w-full cursor-pointer items-center border-0 bg-transparent text-left"
							aria-expanded={isOpen}
							onclick={() => (open = { ...open, [term.term]: !isOpen })}
						>
							<span class="min-w-0 gap-1.5 flex flex-1 flex-wrap items-center">
								<span
									class="text-sm font-semibold text-on-surface"
									class:text-on-surface-variant={term.when === 'past' && !behind}>{term.term}</span
								>
							</span>
							<span
								class="text-xs shrink-0"
								class:text-error={behind}
								class:font-semibold={behind || term.when === 'registering'}
								class:text-primary={term.when === 'registering'}
								class:text-on-surface-variant={!behind && term.when !== 'registering'}
								>{summary(term)}</span
							>
							<span class="chev text-on-surface-variant shrink-0" class:rotate-180={isOpen}
								><Icon icon={iconExpand} size={18} /></span
							>
						</button>
						{#if isOpen}
							<div class="gap-1.5 pb-2 flex flex-wrap">
								{#each term.rows as row, rowIndex (rowIndex)}
									{@const key = `${term.term}:${rowIndex}`}
									{@render chip(
										kindOf(plan, row, term),
										chipLabel(plan, row),
										focus === key,
										() => (focus = focus === key ? null : key)
									)}
								{/each}
							</div>
							{#if focused}
								{@const info = explain(plan, focused, term, program.hss)}
								<div class="mb-2 rounded-xl bg-surface-container p-3" role="status">
									<p class="m-0 text-sm font-semibold text-on-surface">{info.title}</p>
									{#if info.meta}
										<p class="m-0 text-xs font-medium text-on-surface-variant">{info.meta}</p>
									{/if}
									{#if info.text}
										<p class="m-0 mt-1 text-xs text-on-surface-variant">{info.text}</p>
									{/if}
									{#if info.warning}
										<p class="m-0 mt-1.5 text-xs font-medium text-error">{info.warning}</p>
									{/if}
								</div>
							{/if}
							{#if term.when === 'registering' && summary(term) !== `${term.rows.length} of ${term.rows.length} in your schedule`}
								<div class="pb-2">
									<Button variant="tonal" onclick={toCourses}>Go to courses</Button>
								</div>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ol>
		<div
			class="gap-x-3 gap-y-1 px-1 pt-1 pb-1.5 border-outline-variant flex flex-wrap border-t"
			aria-label="Legend"
		>
			{#each Object.entries(KINDS) as [k, item] (k)}
				<span class="gap-1 pt-1.5 text-on-surface-variant inline-flex items-center text-[0.6875rem]"
					><span class="swatch {k} inline-flex"><Icon icon={item.icon} size={12} /></span
					>{item.label}</span
				>
			{/each}
		</div>
	</section>
{:else}
	<MinorCard {plan} {program} />
{/if}

{#if program.hss}
	<HssCard {plan} hss={program.hss} />
{/if}

<style>
	.chip,
	.swatch {
		border: 1px solid transparent;
		background: rgb(var(--m3-scheme-surface-container-high));
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.swatch {
		border-radius: 0.25rem;
		padding: 1px;
	}
	.done {
		background: rgb(var(--m3-scheme-primary-container));
		color: rgb(var(--m3-scheme-on-primary-container));
	}
	.now {
		background: rgb(var(--m3-scheme-tertiary-container));
		color: rgb(var(--m3-scheme-on-tertiary-container));
	}
	.scheduled {
		background: rgb(var(--m3-scheme-primary));
		color: rgb(var(--m3-scheme-on-primary));
	}
	.behind {
		background: rgb(var(--m3-scheme-error-container));
		color: rgb(var(--m3-scheme-on-error-container));
	}
	.todo {
		background: transparent;
		border: 1px dashed rgb(var(--m3-scheme-primary));
		color: rgb(var(--m3-scheme-primary));
	}
	.chip.ring {
		outline: 2px solid rgb(var(--m3-scheme-on-surface));
		outline-offset: 1px;
	}
	.chip:focus-visible,
	.head:focus-visible {
		outline: 2px solid rgb(var(--m3-scheme-primary));
		outline-offset: 2px;
		border-radius: 0.5rem;
	}
	.chev {
		display: inline-flex;
		transition: transform 150ms;
	}
	.line {
		background: rgb(var(--m3-scheme-outline-variant));
	}
	.line.dashed {
		background: repeating-linear-gradient(
			to bottom,
			rgb(var(--m3-scheme-outline-variant)) 0 3px,
			transparent 3px 6px
		);
	}
	.node {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		border: 2px solid rgb(var(--m3-scheme-outline));
		background: rgb(var(--m3-scheme-surface));
		flex-shrink: 0;
	}
	.node.past {
		background: rgb(var(--m3-scheme-primary));
		border-color: rgb(var(--m3-scheme-primary));
	}
	.node.behind {
		background: rgb(var(--m3-scheme-error));
		border-color: rgb(var(--m3-scheme-error));
	}
	.node.current:not(.behind) {
		border-color: rgb(var(--m3-scheme-tertiary));
		background: rgb(var(--m3-scheme-tertiary-container));
	}
	.node.registering {
		border-color: rgb(var(--m3-scheme-primary));
		box-shadow: 0 0 0 4px rgb(var(--m3-scheme-primary) / 0.2);
	}
	.node.estimate {
		border-style: dashed;
	}
	.node.coop {
		border-radius: 0.2rem;
	}
</style>
