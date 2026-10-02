<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from 'm3-svelte';

	let {
		open = $bindable(false),
		title,
		children,
		onclose
	}: { open?: boolean; title: string; children: Snippet; onclose?: () => void } = $props();
	let dialog: HTMLDialogElement;
	const titleId = $props.id();

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	class="max-w-lg rounded-2xl bg-surface-container-low p-0 text-on-surface shadow-xl backdrop:bg-scrim/40 m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] overflow-hidden border-0 open:flex open:flex-col"
	onclose={() => {
		open = false;
		onclose?.();
	}}
>
	<header
		class="gap-3 border-outline-variant p-4 flex shrink-0 items-center justify-between border-b"
	>
		<h2 id={titleId} class="text-lg font-semibold">{title}</h2>
		<Button variant="text" onclick={() => (open = false)}>Close</Button>
	</header>
	<div class="min-h-0 p-4 overflow-y-auto overscroll-contain">{@render children()}</div>
</dialog>
