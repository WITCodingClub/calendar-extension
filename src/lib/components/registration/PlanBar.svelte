<script lang="ts">
	import { Button } from 'm3-svelte';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';

	let { action = 'Review', onreview }: { action?: string; onreview: () => void } = $props();
	const plan = getRegistrationPlan();
	const first = $derived(plan.issues[0]?.text);
</script>

<div
	class="bottom-3 gap-3 rounded-2xl bg-surface-container-high px-4 py-3 sticky z-30 flex items-center justify-between shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.16)]"
>
	<div class="min-w-0 flex flex-col">
		<span class="text-sm font-bold text-on-surface"
			>{plan.added.length}
			{plan.added.length === 1 ? 'course' : 'courses'} · {plan.credits} credits</span
		>
		<span class="text-xs truncate" class:text-error={first} class:text-on-surface-variant={!first}
			>{first
				? `${first}${plan.issues.length > 1 ? ` (+${plan.issues.length - 1} more)` : ''}`
				: plan.added.length
					? 'Ready to register'
					: 'Add a course to start'}</span
		>
	</div>
	<Button disabled={!plan.added.length} onclick={onreview}>{action}</Button>
</div>
