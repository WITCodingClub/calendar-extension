<script lang="ts">
	import { onMount } from 'svelte';
	import { featureFlags } from '$lib/featureFlags';
	import { PanelSession, setPanelSession } from '$lib/panelSession';
	import { enrolledTerms, icsUrl, processedData, userSettings } from '$lib/store';

	let { children } = $props();

	// This layout stays mounted while the user moves between the calendar and
	// friends pages, so their session lasts until the panel closes.
	let session = $state.raw(new PanelSession());
	setPanelSession(() => session);

	onMount(() => {
		function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
			const change = changes.environment_data;
			if (!change || change.oldValue?.current_environment === change.newValue?.current_environment) {
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
		}

		chrome.storage.onChanged.addListener(onStorageChanged);
		return () => {
			chrome.storage.onChanged.removeListener(onStorageChanged);
			session.active = false;
		};
	});
</script>

{#key session}
	{@render children()}
{/key}
