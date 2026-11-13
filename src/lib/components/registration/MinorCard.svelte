<script lang="ts">
	import { Icon } from 'm3-svelte';
	import { KINDS, type Kind } from '$lib/registration/progress';
	import type { RegistrationPlan } from '$lib/registration/plan.svelte';
	import type { DegreeProgram, ProgramList } from '$lib/registration/types';

	type ListCourse = ProgramList['courses'][number];

	let { plan, program }: { plan: RegistrationPlan; program: DegreeProgram } = $props();

	function scheduledTerm(code: string) {
		return plan.termOptions.find((term) => plan.byTerm[term.uid]?.added.includes(code))?.name;
	}

	function kind(course: ListCourse): Kind {
		if (course.status === 'done') return 'done';
		if (course.status === 'in_progress') return 'now';
		if (scheduledTerm(course.code)) return 'scheduled';
		return 'later';
	}

	function note(course: ListCourse) {
		if (course.status === 'done') return course.term ? `Done ${course.term}` : 'Done';
		if (course.status === 'in_progress') return 'Taking now';
		const term = scheduledTerm(course.code);
		if (term) return `In your ${term} schedule`;
		if (course.major_term) return `In your major plan · ${course.major_term}`;
		return 'Not in your major. Counts only for the minor.';
	}
</script>

{#each program.lists as list, index (`${index}:${list.name}`)}
	{@const met = list.courses.filter((course) => course.status === 'done').length}
	<section class="gap-2 rounded-2xl bg-surface-container-low p-4 flex flex-col">
		<div class="gap-2 flex items-baseline justify-between">
			<h2 class="m-0 text-sm font-bold text-on-surface">{list.name}</h2>
			{#if list.checkable}
				<span class="text-xs text-on-surface-variant shrink-0"
					>{list.min_courses ? `${met} of ${list.min_courses} done` : `${met} done`}</span
				>
			{/if}
		</div>
		{#if list.notes}<p class="m-0 text-xs text-on-surface-variant">{list.notes}</p>{/if}
		{#if list.courses.length}
			<ul class="m-0 p-0 divide-outline-variant/60 list-none divide-y">
				{#each list.courses as course (course.code)}
					{@const k = kind(course)}
					<li class="gap-3 py-2 flex items-start">
						<span class="icon {k} mt-0.5 inline-flex shrink-0"
							><Icon icon={KINDS[k].icon} size={18} /></span
						>
						<div class="min-w-0 flex-1">
							<p class="m-0 text-sm text-on-surface">
								{course.title ? `${course.code} · ${course.title}` : course.code}
							</p>
							<p
								class="m-0 text-xs"
								class:text-primary={!course.major_term && course.status === 'open'}
								class:text-on-surface-variant={course.major_term || course.status !== 'open'}
							>
								{note(course)}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}

<style>
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
