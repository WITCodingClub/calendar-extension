<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import PanelHeader, { type PanelNavigationItem } from './PanelHeader.svelte';
	import iconCalendar from '@ktibow/iconset-material-symbols/calendar-month';
	import iconSettings from '@ktibow/iconset-material-symbols/settings-outline';
	import iconHelp from '@ktibow/iconset-material-symbols/help-outline';

	let {
		title,
		mode,
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
		mode: string;
		tab: string;
		tabs: PanelNavigationItem[];
		view?: string;
		prepareHref?: () => Promise<string>;
		tabActions?: Snippet;
		headerContent?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();

	const modes = [
		{
			name: 'Calendar',
			value: 'calendar',
			icon: iconCalendar,
			onselect: () => void goto(resolve('/calendar'))
		}
	];
	const utilities = [
		{
			name: 'Settings',
			value: 'settings',
			icon: iconSettings,
			onselect: () => void goto(resolve('/settings'))
		},
		{ name: 'Help', value: 'help', icon: iconHelp, onselect: () => void goto(resolve('/help')) }
	];
</script>

<div
	class="{className} min-w-0 gap-3 p-3 text-on-surface @max-[20rem]:p-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold @container flex w-full flex-col"
>
	<PanelHeader {title} {mode} {modes} {tab} {tabs} {utilities} {view} {prepareHref} {tabActions}>
		{@render headerContent?.()}
	</PanelHeader>
	{@render children()}
</div>
