<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, LoadingIndicator } from 'm3-svelte';
	import ErrorNotice from '$lib/components/ui/ErrorNotice.svelte';

	type Status = { error: string; loaded: boolean; retry(): unknown };

	let {
		sources,
		label,
		title = "Couldn't load",
		children
	}: { sources: Status[]; label: string; title?: string; children: Snippet } = $props();
	const failed = $derived(sources.find((source) => source.error));
	const loading = $derived(sources.some((source) => !source.loaded && !source.error));
</script>

{#if failed}
	<section class="gap-2 rounded-2xl bg-error p-6 flex flex-col items-center" role="alert">
		<ErrorNotice {title} error={failed.error} />
		<Button variant="elevated" onclick={() => void failed.retry()}>Try again</Button>
	</section>
{:else if loading}
	<div
		class="min-h-64 gap-3 rounded-2xl bg-surface-container-low flex w-full flex-col items-center justify-center"
		role="status"
		aria-busy="true"
	>
		<LoadingIndicator size={44} center={false} />
		<p class="m-0 text-sm text-on-surface-variant">{label}</p>
	</div>
{:else}
	{@render children()}
{/if}
