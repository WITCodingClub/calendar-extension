<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Button, ConnectedButtons, snackbar } from 'm3-svelte';
	import { checkBetaAccess, getUsableJwt } from '$lib/auth/session';
	import { getPanelSession } from '$lib/panel/session';
	import PanelShell from '$lib/components/panel/PanelShell.svelte';
	import { droppedMessage } from '$lib/registration/options';
	import { RegistrationPlan, setRegistrationPlan } from '$lib/registration/plan.svelte';

	let { children } = $props();
	const plan = new RegistrationPlan(getPanelSession());
	setRegistrationPlan(() => plan);
	let mounted = true;

	const activeTab = $derived(
		page.route.id === '/(panel)/(registration)/registration/schedule'
			? 'schedule'
			: page.route.id === '/(panel)/(registration)/registration/progress'
				? 'progress'
				: 'courses'
	);
	const tabs = [
		{ name: 'Courses', value: 'courses', onselect: () => void goto(resolve('/registration')) },
		{
			name: 'Schedule',
			value: 'schedule',
			onselect: () => void goto(resolve('/registration/schedule'))
		},
		{
			name: 'Progress',
			value: 'progress',
			onselect: () => void goto(resolve('/registration/progress'))
		}
	];

	onMount(async () => {
		if (!(await getUsableJwt())) {
			void goto(resolve('/'));
			return;
		}
		checkBetaAccess();
		if (mounted) plan.start();
	});

	onDestroy(() => {
		mounted = false;
		plan.destroy();
	});

	$effect(() => {
		const message = droppedMessage(plan.dropped);
		if (!message) return;
		untrack(() => {
			snackbar(message, undefined, true);
			plan.clearDropped();
		});
	});
</script>

<PanelShell title="Registration" mode="registration" tab={activeTab} {tabs}>
	{#snippet headerContent()}
		<div class="gap-2 px-4 py-3 flex flex-wrap items-center justify-between">
			<div class="min-w-0 min-h-10 max-w-full [&>.m3-container]:flex! [&>.m3-container]:flex-wrap!">
				<ConnectedButtons>
					{#each plan.termOptions as option (option.uid)}
						<input
							type="radio"
							name="registration-term"
							id={`registration-term-${option.uid}`}
							bind:group={plan.term}
							value={option.uid}
						/>
						<Button for={`registration-term-${option.uid}`}>{option.name}</Button>
					{/each}
				</ConnectedButtons>
			</div>
		</div>
	{/snippet}
	{@render children()}
</PanelShell>
