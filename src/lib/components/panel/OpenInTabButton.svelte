<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { snackbar } from 'm3-svelte';
	import { openPageInTab } from '$lib/browser/tabs';

	let { view, prepareHref }: { view?: string; prepareHref?: () => Promise<string> } = $props();
	let windowId = $state<number | undefined>(undefined);
	let opening = $state(false);

	onMount(() => {
		void Promise.all([chrome.tabs.getCurrent(), chrome.windows.getCurrent()])
			.then(([tab, window]) => {
				if (!tab) windowId = window.id;
			})
			.catch((error) => console.error('Error detecting extension sidebar:', error));
	});

	async function openInTab() {
		if (windowId === undefined || opening) return;
		opening = true;
		try {
			const href = prepareHref ? await prepareHref() : page.url.href;
			await openPageInTab(href, windowId, view);
		} catch (error) {
			console.error('Error opening extension page:', error);
			snackbar('Could not open this page in a new tab.', undefined, true);
		} finally {
			opening = false;
		}
	}
</script>

{#if windowId !== undefined}
	<button
		type="button"
		class="h-10 w-10 text-on-secondary-container hover:bg-on-secondary-container/10 focus-visible:outline-primary flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
		aria-label="Open in new tab"
		title="Open in new tab"
		disabled={opening}
		onclick={openInTab}
	>
		<svg
			aria-hidden="true"
			class="h-5 w-5"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"
			/>
		</svg>
	</button>
{/if}
