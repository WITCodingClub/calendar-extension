<script lang="ts">
	import { onMount } from 'svelte';
	import PanelShell from '$lib/components/PanelShell.svelte';
	import { PanelUi, setPanelUi } from '$lib/panelUi.svelte';
	import { featureFlags } from '$lib/featureFlags';
	import { PanelSession, setPanelSession } from '$lib/panelSession';
	import { enrolledTerms, icsUrl, processedData, userSettings } from '$lib/store';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { restorePanelHandoff } from '$lib/panelHandoff';
	import { snackbar } from 'm3-svelte';

	let { children } = $props();

	// This layout stays mounted while the user moves between the calendar and
	// friends pages, so their session lasts until the panel closes.
	let session = $state.raw(new PanelSession());
	setPanelSession(() => session);
	let ui = $state.raw(new PanelUi());
	setPanelUi(() => ui);
	let restoring = $state(browser && page.url.searchParams.has('panel-state'));

	onMount(() => {
		if (restoring) {
			void restorePanelHandoff(ui, session, page.url.href)
				.catch((error) => {
					console.error('Failed to restore panel state', error);
					snackbar(
						'Could not restore the panel state. Reopen the page from the panel to try again.',
						undefined,
						true
					);
				})
				.finally(() => {
					restoring = false;
				});
		}
		function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
			const change = changes.environment_data;
			const previousEnvironment = change?.oldValue?.current_environment ?? 'prod';
			const currentEnvironment = change?.newValue?.current_environment ?? 'prod';
			if (
				!change ||
				(previousEnvironment === currentEnvironment &&
					change.oldValue?.jwt_tokens?.[previousEnvironment] ===
						change.newValue?.jwt_tokens?.[currentEnvironment])
			) {
				return;
			}
			// Drop the data of the environment that the user left, then start a
			// new session. The pages mount again and load for the new environment.
			session.active = false;
			processedData.set([]);
			userSettings.set(undefined);
			icsUrl.set(undefined);
			enrolledTerms.set([]);
			featureFlags.clearCache();
			session = new PanelSession();
			ui = new PanelUi();
		}

		chrome.storage.onChanged.addListener(onStorageChanged);
		return () => {
			chrome.storage.onChanged.removeListener(onStorageChanged);
			session.active = false;
		};
	});
</script>

{#if !restoring}
	{#key session}
		<PanelShell>{@render children()}</PanelShell>
	{/key}
{/if}
