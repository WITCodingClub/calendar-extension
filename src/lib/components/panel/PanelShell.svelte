<script lang="ts">
	import { PEOPLE_ICON, REFRESH_ICON } from '$lib/icons';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { Button, ConnectedButtons, VariableTabs, LoadingIndicator } from 'm3-svelte';
	import { processedData, termClasses } from '$lib/stores';
	import { meetingMessage, scheduleMessage } from '$lib/friends/availability';
	import { savePanelHandoff } from '$lib/panel/handoff';
	import { getPanelSession } from '$lib/panel/session';
	import { onMount, type Snippet } from 'svelte';
	import OpenInTabButton from './OpenInTabButton.svelte';
	import ManageFriendsDrawer from '$lib/components/friends/ManageFriendsDrawer.svelte';
	import ConnectedFriends from '$lib/components/friends/ConnectedFriends.svelte';
	import MeetingEditor from '$lib/components/friends/MeetingEditor.svelte';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import '$lib/components/friends/preview.css';
	let { children }: { children: Snippet } = $props();
	const ui = getPanelUi();
	const session = getPanelSession();
	onMount(() => {
		const timer = setInterval(() => {
			const now = Date.now();
			if (Math.floor(now / 60000) !== Math.floor(ui.now / 60000)) ui.now = now;
		}, 1000);
		return () => clearInterval(timer);
	});
	const view = $derived(browser ? page.url.searchParams.get('view') : null);
	const activeTab = $derived(
		page.route.id === '/(panel)/friends'
			? 'friends'
			: view === 'settings'
				? 'settings'
				: view === 'help'
					? 'help'
					: 'calendar'
	);
	const titles: Record<string, string> = {
		calendar: 'Your Calendar',
		friends: 'Friends',
		settings: 'Settings',
		help: 'Help'
	};
	$effect(() => {
		ui.planning = activeTab === 'friends';
	});
	$effect(() => {
		ui.savePlanning();
	});
	$effect(() => {
		const slot = ui.restoredPreview;
		if (!slot) return;
		const ownCourses = termClasses($processedData, ui.scheduleTerm);
		if (scheduleMessage(ui, ownCourses)) return;
		if (
			!meetingMessage(ui, ownCourses, slot) &&
			(!ui.meetingDraft || JSON.stringify(ui.meetingDraft.slot) === JSON.stringify(slot))
		)
			ui.highlightedSlot = slot;
		ui.restoredPreview = undefined;
	});
	$effect(() => {
		const slot = ui.highlightedSlot;
		if (!slot) return;
		if (ui.meetingDraft && JSON.stringify(ui.meetingDraft.slot) !== JSON.stringify(slot)) {
			ui.highlightedSlot = undefined;
			return;
		}
		const ownCourses = ui.scheduleTerm
			? termClasses($processedData, ui.scheduleTerm)
			: $processedData.at(-1)?.responseData.classes;
		if (meetingMessage(ui, ownCourses, slot)) ui.highlightedSlot = undefined;
	});
</script>

<div
	class="friends-preview min-w-0 gap-3 p-3 text-on-surface @max-[20rem]:p-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold @container flex w-full flex-col"
>
	<section
		class="rounded-2xl bg-surface-container w-full shrink-0 overflow-hidden shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.12)]"
	>
		<header
			class="gap-3 bg-secondary-container px-4 py-4 text-on-secondary-container flex items-center justify-between"
		>
			<h1 class="leading-tight text-[clamp(1.35rem,5cqi,1.8rem)] font-[750] tracking-[-0.025em]">
				{titles[activeTab]}
			</h1>
			<OpenInTabButton
				view={activeTab === 'calendar' ? 'a' : activeTab}
				prepareHref={() => savePanelHandoff(ui, session, page.url.href)}
			/>
		</header>
		<div class="bg-surface flex items-center">
			<div class="preview-tabs min-w-0 flex-1">
				<VariableTabs
					secondary
					tab={activeTab}
					items={[
						{ name: 'Calendar', value: 'calendar' },
						{ name: 'Friends', value: 'friends' },
						{ name: 'Settings', value: 'settings' },
						{ name: 'Help', value: 'help' }
					]}
					onchange={(event) => {
						const value = event.currentTarget.value;
						if (value === 'friends') void goto(resolve('/friends'));
						else if (value === 'calendar') void goto(resolve('/calendar'));
						else {
							let destination: string = resolve('/calendar');
							destination += `?view=${value}`;
							void goto(destination);
						}
					}}
				/>
			</div>
			<div class="px-1 shrink-0">
				<Button
					variant="text"
					iconType="full"
					aria-label="Manage friends"
					title="Manage friends"
					onclick={() => (ui.manageOpen = true)}
				>
					<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"
						><path fill="currentColor" d={PEOPLE_ICON} /></svg
					>
				</Button>
			</div>
		</div>
		{#if activeTab === 'calendar'}
			<div class="gap-2 px-4 py-3 flex flex-wrap items-center justify-between">
				<div class="min-w-0 max-w-full [&>.m3-container]:flex! [&>.m3-container]:flex-wrap!">
					<ConnectedButtons>
						{#each ui.termOptions as term (term.id)}
							<input
								type="radio"
								name="panel-term"
								id={`panel-term-${term.id}`}
								bind:group={ui.term}
								value={term.id}
							/>
							<Button for={`panel-term-${term.id}`}>{term.name}</Button>
						{/each}
					</ConnectedButtons>
				</div>
				<div class="gap-2 ml-auto flex shrink-0 items-center">
					{#if ui.calendarActions}
						{#if ui.calendarActions.copyLink}<Button
								variant="tonal"
								onclick={ui.calendarActions.copyLink}>Copy Calendar Link</Button
							>{/if}
						{#if ui.calendarActions.refreshing}<LoadingIndicator size={44} />
						{:else}<Button
								variant="tonal"
								onclick={ui.calendarActions.refresh}
								disabled={ui.calendarActions.loading}
								aria-label="Refresh class schedule"
								title="Refresh class schedule"
							>
								<svg
									aria-hidden="true"
									width="20"
									height="20"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d={REFRESH_ICON} />
								</svg>
							</Button>{/if}
					{/if}
				</div>
			</div>
		{:else}
			<div class="border-outline-variant bg-surface-container-high px-4 py-3 border-t">
				<h2 class="m-0 text-sm font-bold text-on-surface">
					{activeTab === 'friends'
						? 'Plan with friends'
						: activeTab === 'settings'
							? 'Calendar preferences'
							: 'Information'}
				</h2>
				<p class="m-0 mt-0.5 text-xs text-on-surface-variant">
					{activeTab === 'friends'
						? 'Find shared free time, compare calendars, save meetings, or create meeting links.'
						: activeTab === 'settings'
							? 'Manage your settings, account information, and event notifications.'
							: 'Subscribe in another calendar app or customize event titles with templates.'}
				</p>
			</div>
		{/if}
	</section>
	{@render children()}
	<ConnectedFriends
		loadSchedules={(activeTab === 'friends' || ui.comparison) && ui.hasSelectedFriends}
	/>
	<ManageFriendsDrawer bind:open={ui.manageOpen} />
	<MeetingEditor />
</div>
