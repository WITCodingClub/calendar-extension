<script lang="ts">
	import { Button, LoadingIndicator } from 'm3-svelte';
	import ErrorNotice from '$lib/components/ui/ErrorNotice.svelte';
	import RegistrationProgress from '$lib/components/registration/RegistrationProgress.svelte';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';

	const plan = getRegistrationPlan();
	const progress = $derived(plan.progress);
</script>

{#if progress.error}
	<section class="gap-2 rounded-2xl bg-error p-6 flex flex-col items-center">
		<ErrorNotice title="Couldn't load your progress" error={progress.error} />
		<Button variant="elevated" onclick={() => void progress.retry()}>Try again</Button>
	</section>
{:else if !progress.data}
	<div
		class="min-h-48 gap-3 rounded-2xl bg-surface-container-low flex w-full flex-col items-center justify-center"
		role="status"
		aria-busy="true"
	>
		<LoadingIndicator size={44} center={false} />
		<p class="text-sm text-on-surface-variant">Loading your progress…</p>
	</div>
{:else if !plan.programs.length}
	<section class="gap-1 rounded-2xl bg-surface-container-low p-4 flex flex-col">
		<h2 class="m-0 text-sm font-bold text-on-surface">No programs yet</h2>
		<p class="m-0 text-xs text-on-surface-variant">
			Your degree progress shows here once your programs are on your profile.
		</p>
	</section>
{:else}
	<RegistrationProgress />
{/if}
