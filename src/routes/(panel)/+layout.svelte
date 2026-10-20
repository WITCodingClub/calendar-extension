<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { PanelUi, setPanelUi } from '$lib/panel/ui.svelte';
	import { featureFlags } from '$lib/featureFlags';
	import { PanelSession, setPanelSession } from '$lib/panel/session';
	import { PanelSettings, setPanelSettings } from '$lib/panel/settings';
	import { resetStores } from '$lib/stores';

	let { children } = $props();

	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;

		return new Promise<void>((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			void transition.ready.catch(() => undefined);
		});
	});

	// This layout stays mounted while the user moves between the calendar and
	// friends pages, so their session lasts until the panel closes.
	let session: PanelSession | undefined;
	setPanelSession(() => (session ??= new PanelSession()));
	let ui: PanelUi | undefined;
	setPanelUi(() => (ui ??= new PanelUi()));
	let settings: PanelSettings | undefined;
	setPanelSettings(() => (settings ??= new PanelSettings()));
	let generation = $state(0);

	onMount(() => {
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
			if (session) session.active = false;
			if (settings) settings.active = false;
			resetStores();
			featureFlags.clearCache();
			session = undefined;
			settings = undefined;
			ui = undefined;
			generation += 1;
		}

		chrome.storage.onChanged.addListener(onStorageChanged);
		return () => {
			chrome.storage.onChanged.removeListener(onStorageChanged);
			if (session) session.active = false;
			if (settings) settings.active = false;
		};
	});
</script>

{#key generation}
	{@render children()}
{/key}
