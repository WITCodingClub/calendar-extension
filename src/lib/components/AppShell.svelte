<script lang="ts">
	import type { Snippet } from 'svelte';
	import OpenInTabButton from './OpenInTabButton.svelte';

	let {
		children,
		controls,
		title,
		view,
		prepareHref,
		class: className = ''
	}: {
		children: Snippet;
		controls?: Snippet;
		title: string;
		view?: string;
		prepareHref?: () => Promise<string>;
		class?: string;
	} = $props();
</script>

<div
	class="{className} min-w-0 gap-3 p-3 text-on-surface @max-[20rem]:p-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold @container flex w-full flex-col"
>
	<section
		class="rounded-2xl bg-surface-container w-full shrink-0 overflow-hidden shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.12)]"
	>
		<header
			class="gap-3 bg-secondary-container px-4 py-4 text-on-secondary-container flex items-center justify-between"
		>
			<h1 class="leading-tight text-[clamp(1.35rem,5cqi,1.8rem)] font-[750] tracking-[-0.025em]">
				{title}
			</h1>
			<OpenInTabButton {view} {prepareHref} />
		</header>
		{#if controls}{@render controls()}{/if}
	</section>
	{@render children()}
</div>
