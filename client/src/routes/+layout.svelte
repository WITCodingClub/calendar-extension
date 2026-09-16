<script lang="ts">
	import '../main.css';
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { NewSnackbar } from 'm3-svelte';
	import { guardCurrentRoute } from '$lib/auth';

	let { children } = $props();

	afterNavigate(() => {
		void guardCurrentRoute();
	});

</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="overflow-x-hidden">
	{@render children?.()}
</div>
<NewSnackbar />