<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, snackbar } from 'm3-svelte';
	import PlanBar from '$lib/components/registration/PlanBar.svelte';
	import ScheduleBrowser from '$lib/components/registration/ScheduleBrowser.svelte';
	import ScheduleView from '$lib/components/registration/ScheduleView.svelte';
	import SourceStatus from '$lib/components/registration/SourceStatus.svelte';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';

	const plan = getRegistrationPlan();
	const result = $derived(plan.finderResult);
	const browsing = $derived(Boolean(result?.candidates.length) && plan.previewIndex !== null);
	const sources = $derived([
		plan.courses,
		...(plan.term ? [plan.saved] : []),
		...(plan.published ? [plan.catalog] : [])
	]);

	function use() {
		const candidate = result?.candidates[plan.previewIndex ?? 0];
		if (!candidate) return;
		plan.use(candidate);
		plan.finderResult = null;
		void goto(resolve('/registration'));
		snackbar('Schedule added. Tap a course to change its section.', undefined, true);
	}

	function change() {
		plan.stage = 'plan';
		plan.step = 'days';
		void goto(resolve('/registration'));
	}

	function build() {
		plan.stage = 'plan';
		plan.resetFinder();
		plan.step = 'courses';
		void goto(resolve('/registration'));
	}

	function review() {
		plan.stage = 'review';
		void goto(resolve('/registration'));
	}
</script>

<SourceStatus {sources} label="Loading your schedule…">
	{#if plan.data && !plan.termOptions.length}
		<p class="m-0 text-sm text-on-surface-variant">There's no term to register for right now.</p>
	{:else if !plan.published}
		<p class="m-0 text-sm text-on-surface-variant">
			Sections for {plan.termName} aren't posted yet.
		</p>
	{:else if browsing && result}
		<ScheduleBrowser {result} onchange={change} onuse={use} />
	{:else if !plan.added.length}
		<section class="gap-3 rounded-2xl bg-surface-container-low p-6 flex flex-col items-center">
			<p class="m-0 text-sm text-on-surface-variant text-center">
				Your schedule shows up here once you add courses.
			</p>
			<Button variant="tonal" onclick={build}>Build my schedule</Button>
		</section>
	{:else}
		<ScheduleView />
		<PlanBar onreview={review} />
	{/if}
</SourceStatus>
