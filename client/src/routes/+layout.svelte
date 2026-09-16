<script lang="ts">
	import '../main.css';
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { NewSnackbar } from 'm3-svelte';
	import { clearLocalData, guardCurrentRoute } from '$lib/auth';

	let { children } = $props();

	afterNavigate(() => {
		void guardCurrentRoute();
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
<NewSnackbar />