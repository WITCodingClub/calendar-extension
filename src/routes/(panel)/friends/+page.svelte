<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	const ui = getPanelUi();
	onMount(() => {
		if (page.url.searchParams.get('view') === 'calendar') {
			ui.comparison = true;
			void goto(resolve('/calendar'), { replaceState: true });
		}
	});
</script>
