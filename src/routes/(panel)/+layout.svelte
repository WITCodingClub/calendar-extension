<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { PanelUi, setPanelUi } from '$lib/panel/ui.svelte';
	import { featureFlags } from '$lib/featureFlags';
	import { PanelSession, setPanelSession } from '$lib/panel/session';
	import { PanelSettings, setPanelSettings } from '$lib/panel/settings';
	import { resetStores } from '$lib/stores';
	import { getUsableJwt, AuthError } from '$lib/auth/session';
	import { backfillAcademicData } from '$lib/calendar/academicSync';
	import { snackbar } from 'm3-svelte';

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
	let generation = $state(0);
	let session: PanelSession | undefined;
	setPanelSession(() => (session ??= new PanelSession()));
	const ui = $derived.by(() => {
		void generation;
		return new PanelUi();
	});
	setPanelUi(() => ui);
	let settings: PanelSettings | undefined;
	setPanelSettings(() => (settings ??= new PanelSettings()));

	async function startBackfills() {
		const current = (session ??= new PanelSession());
		try {
			if (!(await getUsableJwt()) || !current.active) return;
			const result = await backfillAcademicData(current.backfills, () => current.active);
			if (current.active && result?.warnings.length)
				snackbar(result.warnings.join(' '), undefined, true);
		} catch (error) {
			if (current.active && !(error instanceof AuthError))
				snackbar(
					`Academic data backfill did not finish: ${error instanceof Error ? error.message : 'Try reopening the panel.'}`,
					undefined,
					true
				);
		}
	}

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
			generation += 1;
			void startBackfills();
		}

		chrome.storage.onChanged.addListener(onStorageChanged);
		void startBackfills();
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
