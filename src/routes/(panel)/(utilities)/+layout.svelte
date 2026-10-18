<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { checkBetaAccess, getUsableJwt } from '$lib/auth/session';
	import PanelShell from '$lib/components/panel/PanelShell.svelte';

	let { children } = $props();
	const settings = $derived(page.route.id === '/(panel)/(utilities)/settings');
	onMount(async () => {
		if (!(await getUsableJwt())) {
			void goto(resolve('/'));
			return;
		}
		checkBetaAccess();
	});
</script>

<PanelShell title={settings ? 'Settings' : 'Help'} tab={settings ? 'settings' : 'help'} tabs={[]}>
	{#snippet headerContent()}
		<div class="border-outline-variant bg-surface-container-high px-4 py-3 border-t">
			<h2 class="m-0 text-sm font-bold text-on-surface">
				{settings ? 'Calendar preferences' : 'Information'}
			</h2>
			<p class="m-0 mt-0.5 text-xs text-on-surface-variant">
				{settings
					? 'Manage your settings, account information, and event notifications.'
					: 'Subscribe in another calendar app or customize event titles with templates.'}
			</p>
		</div>
	{/snippet}
	{@render children()}
</PanelShell>
