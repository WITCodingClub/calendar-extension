<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { PanelUi, setPanelUi } from '$lib/panel/ui.svelte';
	import { featureFlags } from '$lib/featureFlags';
	import { PanelSession, setPanelSession } from '$lib/panel/session';
	import { PanelSettings, setPanelSettings } from '$lib/panel/settings';
	import { resetStores } from '$lib/stores';
	import { getUsableJwt } from '$lib/auth/session';
	import { Button, Dialog } from 'm3-svelte';
	import { getCourseSync } from '$lib/panel/courseSync';
	import { openStudentSignIn } from '$lib/calendar/academicProfile';

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

	const courseSync = $derived.by(() => {
		void generation;
		return getCourseSync((session ??= new PanelSession()));
	});
	let syncDialogOpen = $derived(Boolean($courseSync.message));

	async function startBackfills() {
		const current = (session ??= new PanelSession());
		if (!(await getUsableJwt()) || !current.active) return;
		await getCourseSync(current).run();
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

<Dialog
	headline="Course sync needs attention"
	aria-label="Course sync needs attention"
	role="dialog"
	bind:open={syncDialogOpen}
>
	<p>{$courseSync.message}</p>
	{#if $courseSync.loginUrl}
		<p>After signing in, return here and select Retry.</p>
	{/if}
	{#snippet buttons()}
		<div class="sync-actions">
			<Button variant="text" onclick={() => (syncDialogOpen = false)}>Close</Button>
			{#if $courseSync.loginUrl}
				<Button
					variant="text"
					disabled={$courseSync.running}
					onclick={() => openStudentSignIn($courseSync.loginUrl!)}
				>
					Sign in to LeopardWeb
				</Button>
			{/if}
			<Button
				variant="tonal"
				disabled={$courseSync.running}
				onclick={() => courseSync.run(undefined, true)}
			>
				{$courseSync.running ? 'Retrying…' : 'Retry'}
			</Button>
		</div>
	{/snippet}
</Dialog>

{#key generation}
	{@render children()}
{/key}

<style>
	.sync-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
