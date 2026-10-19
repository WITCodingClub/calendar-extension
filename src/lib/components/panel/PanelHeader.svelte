<script module lang="ts">
	import type { IconifyIcon } from '@iconify/types';

	export type PanelNavigationItem = {
		name: string;
		value: string;
		icon?: IconifyIcon;
		onselect: () => void;
	};
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { VariableTabs } from 'm3-svelte';
	import OpenInTabButton from './OpenInTabButton.svelte';

	let {
		title,
		tab,
		tabs,
		view,
		prepareHref,
		tabActions,
		children
	}: {
		title: string;
		tab: string;
		tabs: PanelNavigationItem[];
		view?: string;
		prepareHref?: () => Promise<string>;
		tabActions?: Snippet;
		children?: Snippet;
	} = $props();

	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

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
	<div class="bg-surface flex items-center">
		<div class="preview-tabs min-w-0 flex-1">
			<VariableTabs
				secondary
				disabled={!ready}
				{tab}
				items={tabs}
				onchange={(event) =>
					tabs.find((item) => item.value === event.currentTarget.value)?.onselect()}
			/>
		</div>
		{#if tabActions}<div class="px-1 shrink-0">{@render tabActions()}</div>{/if}
	</div>
	{@render children?.()}
</section>
