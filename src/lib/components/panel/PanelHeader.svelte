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
	import { Divider, Icon, Menu, MenuItem, VariableTabs } from 'm3-svelte';
	import iconMenu from '@ktibow/iconset-material-symbols/menu';
	import iconCheck from '@ktibow/iconset-material-symbols/check';
	import OpenInTabButton from './OpenInTabButton.svelte';

	let {
		title,
		mode,
		modes,
		tab,
		tabs,
		utilities,
		view,
		prepareHref,
		tabActions,
		children
	}: {
		title: string;
		mode: string;
		modes: PanelNavigationItem[];
		tab: string;
		tabs: PanelNavigationItem[];
		utilities: PanelNavigationItem[];
		view?: string;
		prepareHref?: () => Promise<string>;
		tabActions?: Snippet;
		children?: Snippet;
	} = $props();

	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	const menuId = $props.id();
	let menuButton: HTMLButtonElement;
	let menu: HTMLElement;
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuOpen = $state(false);
	const utilityActive = $derived(utilities.some((item) => item.value === tab));

	function positionMenu() {
		const bounds = menuButton.getBoundingClientRect();
		menuTop = Math.max(8, bounds.bottom + 8);
		menuLeft = Math.max(
			8,
			Math.min(bounds.left, window.innerWidth - menu.getBoundingClientRect().width - 8)
		);
	}

	function select(item: PanelNavigationItem) {
		menu.hidePopover();
		item.onselect();
	}
</script>

<svelte:window
	onresize={() => menuOpen && positionMenu()}
	onscroll={() => menuOpen && positionMenu()}
/>

{#snippet navigationItem(item: PanelNavigationItem, current: 'true' | 'page' | undefined)}
	<div class="navigation-item" aria-current={current}>
		<MenuItem icon={item.icon ?? 'space'} onclick={() => select(item)}>
			<span class="flex-1">{item.name}</span>
			{#if current}<Icon icon={iconCheck} />{/if}
		</MenuItem>
	</div>
{/snippet}

<section
	class="rounded-2xl bg-surface-container w-full shrink-0 overflow-hidden shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.12)]"
>
	<header
		class="gap-3 bg-secondary-container px-4 py-4 text-on-secondary-container flex items-center justify-between"
	>
		<button
			bind:this={menuButton}
			type="button"
			class="h-10 w-10 text-on-secondary-container hover:bg-on-secondary-container/10 focus-visible:outline-primary flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
			aria-label="Open navigation"
			aria-expanded={menuOpen}
			popovertarget={menuId}
		>
			<Icon icon={iconMenu} size={20} />
		</button>
		<h1
			class="min-w-0 leading-tight flex-1 text-[clamp(1.35rem,5cqi,1.8rem)] font-[750] tracking-[-0.025em]"
		>
			{title}
		</h1>
		<OpenInTabButton {view} {prepareHref} />
	</header>
	<nav
		id={menuId}
		bind:this={menu}
		popover="auto"
		aria-label="Application navigation"
		class="m-0 w-70 p-0 max-w-[calc(100vw-1rem)] overflow-y-auto border-0 bg-transparent"
		style:top={`${menuTop}px`}
		style:left={`${menuLeft}px`}
		style:max-height={`calc(100dvh - ${menuTop}px - 0.5rem)`}
		ontoggle={(event) => {
			menuOpen = event.newState === 'open';
			if (menuOpen) positionMenu();
		}}
	>
		<Menu>
			<p class="px-5 py-2 text-sm font-medium text-on-surface-variant">WIT-Calendar</p>
			{#each modes as item (item.value)}
				{@render navigationItem(item, item.value === mode && !utilityActive ? 'true' : undefined)}
			{/each}
			<div class="my-2"><Divider inset /></div>
			{#each utilities as item (item.value)}
				{@render navigationItem(item, item.value === tab ? 'page' : undefined)}
			{/each}
		</Menu>
	</nav>
	{#if tabs.some((item) => item.value === tab)}
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
	{/if}
	{@render children?.()}
</section>

<style>
	.navigation-item {
		margin-inline: 0.5rem;
		border-radius: var(--m3-util-rounding-extra-small);
	}
	.navigation-item :global(button) {
		width: 100%;
		border-radius: inherit;
		text-align: left;
	}
	.navigation-item[aria-current] {
		background-color: rgb(var(--m3-scheme-secondary-container));
	}
	.navigation-item[aria-current] :global(button),
	.navigation-item[aria-current] :global(svg) {
		color: rgb(var(--m3-scheme-on-secondary-container));
	}
</style>
