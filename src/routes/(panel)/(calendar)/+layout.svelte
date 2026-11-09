<script lang="ts">
	import { PEOPLE_ICON, REFRESH_ICON } from '$lib/icons';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { Button, ConnectedButtons, snackbar } from 'm3-svelte';
	import { processedData, termClasses } from '$lib/stores';
	import { meetingMessage, scheduleMessage } from '$lib/friends/availability';
	import { restorePanelHandoff, savePanelHandoff } from '$lib/panel/handoff';
	import { getPanelSession } from '$lib/panel/session';
	import { onMount, onDestroy, tick } from 'svelte';
	import { featureFlags } from '$lib/featureFlags';
	import FriendsWorkspace from '$lib/components/friends/FriendsWorkspace.svelte';
	import SavedMeetingDialogs from '$lib/components/friends/SavedMeetingDialogs.svelte';
	import PanelShell from '$lib/components/panel/PanelShell.svelte';
	import ManageFriendsDrawer from '$lib/components/friends/ManageFriendsDrawer.svelte';
	import ConnectedFriends from '$lib/components/friends/ConnectedFriends.svelte';
	import MeetingEditor from '$lib/components/friends/MeetingEditor.svelte';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import '$lib/components/friends/friends.css';
	let { children } = $props();
	const ui = getPanelUi();
	const session = getPanelSession();
	session.workspaceMounted = true;
	let restoring = $state(browser && page.url.searchParams.has('panel-state'));
	let mounted = true;
	let friendsMounted = $state(false);
	let previousTab = '';
	$effect(() => {
		if (activeTab === 'friends') {
			friendsMounted = true;
			if (previousTab === 'calendar')
				void tick().then(() => {
					ui.friendsReturnTarget?.focus({ preventScroll: true });
					window.scrollTo(0, ui.friendsScroll);
				});
		}
		previousTab = activeTab;
	});

	async function loadFeatures(force = false) {
		ui.featuresLoading = true;
		await featureFlags.loadFlags(force);
		if (!session.active || !mounted) return;
		ui.meetingEventsEnabled = featureFlags.isEnabledSync('friendMeetingEvents');
		ui.meetingLinksEnabled = featureFlags.isEnabledSync('meetingLinks');
		ui.featuresError = featureFlags.error;
		ui.featuresLoading = false;
	}
	ui.featureActions = { reload: () => loadFeatures(true) };
	onMount(() => {
		void loadFeatures();
		const unsubscribe = session.preferences.subscribe(() => session.refreshedTerms.clear());
		const stop = session.preferences.start();
		if (restoring) {
			void restorePanelHandoff(ui, session, page.url.href)
				.catch((error) => {
					console.error('Failed to restore panel state', error);
					snackbar(
						'Could not restore the panel state. Reopen the page from the panel to try again.',
						undefined,
						true
					);
				})
				.finally(() => {
					if (mounted) restoring = false;
				});
		}
		return () => {
			unsubscribe();
			stop();
		};
	});
	onDestroy(() => {
		mounted = false;
		session.workspaceMounted = false;
		session.ownScheduleProcessed = undefined;
		session.attemptedTerms.clear();
		ui.featureActions = undefined;
		ui.friendActions = undefined;
		ui.groupActions = undefined;
		ui.busyActions = undefined;
	});

	onMount(() => {
		const timer = setInterval(() => {
			const now = Date.now();
			if (Math.floor(now / 60000) !== Math.floor(ui.now / 60000)) ui.now = now;
		}, 1000);
		return () => clearInterval(timer);
	});
	const activeTab = $derived(
		page.route.id === '/(panel)/(calendar)/friends' ? 'friends' : 'calendar'
	);
	const tabs = [
		{ name: 'Calendar', value: 'calendar', onselect: () => void goto(resolve('/calendar')) },
		{ name: 'Friends', value: 'friends', onselect: () => void goto(resolve('/friends')) }
	];
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
</script>

{#if !restoring}
	<PanelShell
		title={activeTab === 'friends' ? 'Friends' : 'Your Calendar'}
		mode="calendar"
		tab={activeTab}
		{tabs}
		class="friends-preview"
		view={activeTab === 'calendar' ? 'a' : activeTab}
		prepareHref={() => savePanelHandoff(ui, session, page.url.href)}
	>
		{#snippet tabActions()}
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
		{/snippet}
		{#snippet headerContent()}
			{#if activeTab === 'calendar'}
				<div class="gap-2 px-4 py-3 flex flex-wrap items-center justify-between">
					<div
						class="min-w-0 min-h-10 max-w-full [&>.m3-container]:flex! [&>.m3-container]:flex-wrap!"
					>
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
							<Button
								variant="tonal"
								onclick={ui.calendarActions.refresh}
								disabled={ui.calendarActions.loading || ui.calendarActions.refreshing}
								aria-busy={ui.calendarActions.refreshing}
								aria-label="Refresh class schedule"
								title="Refresh class schedule"
							>
								<svg
									class={ui.calendarActions.refreshing ? 'motion-safe:animate-spin' : ''}
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
							</Button>
						{/if}
					</div>
				</div>
			{:else}
				<div class="border-outline-variant bg-surface-container-high px-4 py-3 border-t">
					<h2 class="m-0 text-sm font-bold text-on-surface">Plan with friends</h2>
					<p class="m-0 mt-0.5 text-xs text-on-surface-variant">
						Find shared free time, compare calendars, save meetings, or create meeting links.
					</p>
				</div>
			{/if}
		{/snippet}
		{@render children()}
		{#if friendsMounted}<div hidden={activeTab !== 'friends'} class="min-w-0 w-full">
				<FriendsWorkspace />
			</div>{/if}
		<ConnectedFriends
			loadSchedules={activeTab === 'friends' ? ui.hasSelectedFriends : ui.comparison}
		/>
		<ManageFriendsDrawer bind:open={ui.manageOpen} />
		<MeetingEditor />
		<SavedMeetingDialogs />
	</PanelShell>
{/if}
