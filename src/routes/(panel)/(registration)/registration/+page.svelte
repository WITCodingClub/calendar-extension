<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'm3-svelte';
	import BuildQuestions from '$lib/components/registration/BuildQuestions.svelte';
	import CourseList from '$lib/components/registration/CourseList.svelte';
	import RegistrationReview from '$lib/components/registration/RegistrationReview.svelte';
	import SourceStatus from '$lib/components/registration/SourceStatus.svelte';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';

	const plan = getRegistrationPlan();

	function start() {
		plan.resetFinder();
		plan.step = 'courses';
		window.scrollTo({ top: 0 });
	}

	async function show() {
		const result = await plan.find();
		if (!result?.candidates.length) return;
		plan.previewIndex = 0;
		plan.step = null;
		void goto(resolve('/registration/schedule'));
	}
</script>

<SourceStatus
	sources={plan.term ? [plan.courses, plan.saved] : [plan.courses]}
	label="Loading your courses…"
>
	{#if plan.data && !plan.termOptions.length}
		<p class="m-0 text-sm text-on-surface-variant">There's no term to register for right now.</p>
	{:else if plan.stage === 'review'}
		<SourceStatus sources={plan.published ? [plan.catalog] : []} label="Loading sections…">
			<RegistrationReview onback={() => (plan.stage = 'plan')} />
		</SourceStatus>
	{:else if plan.step}
		<BuildQuestions onshow={show} />
	{:else}
		{#key plan.term}
			<CourseList onschedule={() => void goto(resolve('/registration/schedule'))}>
				{#snippet top()}
					{#if !plan.added.length}
						<section
							class="gap-2 rounded-2xl bg-primary-container text-on-primary-container p-4 flex flex-col"
						>
							<h2 class="m-0 text-base font-bold">Build my schedule</h2>
							<p class="m-0 text-sm">
								Answer a few questions about your week. We'll pick sections for your recommended
								courses, and you can change anything after.
							</p>
							<div class="flex justify-end"><Button onclick={start}>Get started</Button></div>
						</section>
						<p class="m-0 px-1 text-sm text-on-surface-variant">Or add courses one at a time:</p>
					{:else}
						<div class="gap-2 px-1 flex items-center justify-between">
							<p class="m-0 text-sm text-on-surface-variant">Want to try a different week?</p>
							<Button variant="text" onclick={start}>Rebuild schedule</Button>
						</div>
					{/if}
				{/snippet}
			</CourseList>
		{/key}
	{/if}
</SourceStatus>
