<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import PanelHeader, { type PanelNavigationItem } from './PanelHeader.svelte';

	let {
		title,
		tab,
		tabs,
		view,
		prepareHref,
		tabActions,
		headerContent,
		children,
		class: className = ''
	}: {
		title: string;
		tab: string;
		tabs: PanelNavigationItem[];
		view?: string;
		prepareHref?: () => Promise<string>;
		tabActions?: Snippet;
		headerContent?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	const workspaceTabs = [
		{ name: 'Calendar', value: 'calendar', onselect: () => void goto(resolve('/calendar')) },
		{ name: 'Friends', value: 'friends', onselect: () => void goto(resolve('/friends')) }
	];
	const utilities = [
		{
			name: 'Settings',
			value: 'settings',
			onselect: () => void goto(resolve('/settings'))
		},
		{ name: 'Help', value: 'help', onselect: () => void goto(resolve('/help')) }
	];
	const navigationTabs = $derived([...(tabs.length ? tabs : workspaceTabs), ...utilities]);
</script>

<div
	class="{className} min-w-0 gap-3 p-3 text-on-surface @max-[20rem]:p-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold @container flex w-full flex-col"
>
	<PanelHeader {title} {tab} tabs={navigationTabs} {view} {prepareHref} {tabActions}>
		{@render headerContent?.()}
	</PanelHeader>
	{@render children()}
</div>
