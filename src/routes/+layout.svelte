<script lang="ts">
	import '../main.css';
	import '../app.css';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { NewSnackbar } from 'm3-svelte';
	import { clearLocalData, guardCurrentRoute } from '$lib/auth';
	import { extensionPageUrl } from '$lib/openPageInTab';
	import OfflineEnvironmentDialog from '$lib/components/OfflineEnvironmentDialog.svelte';

	let { children } = $props();

	afterNavigate(() => {
		void guardCurrentRoute();
		if (!['chrome-extension:', 'moz-extension:'].includes(window.location.protocol)) return;
		void chrome.tabs.getCurrent().then((tab) => {
			if (!tab) return;
			const url = extensionPageUrl(window.location.href);
			if (url !== window.location.href) replaceState(url, page.state);
		}).catch((error) => console.error('Error updating extension page URL:', error));
	});

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.repeat) return;
		if (!(event.ctrlKey && event.shiftKey && event.altKey)) return;
		if (event.key !== 'Backspace') return;
		event.preventDefault();
		void clearLocalData();
	}

</script>

<svelte:window onkeydown={onWindowKeyDown} />

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="overflow-x-hidden">
	{@render children?.()}
</div>
<OfflineEnvironmentDialog />
<NewSnackbar />
