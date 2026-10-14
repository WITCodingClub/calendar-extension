<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import FriendsManagement from './FriendsManagement.svelte';
	import type { ManagementState } from '$lib/friends/management';
	let { open = $bindable(false) }: { open?: boolean } = $props();
	const ui = getPanelUi();
	const management = $derived({
		get friends() {
			return ui.friends;
		},
		get groups() {
			return ui.groups;
		},
		get incomingRequests() {
			return ui.incomingRequests;
		},
		get outgoingRequests() {
			return ui.outgoingRequests;
		},
		get friendsLoading() {
			return ui.friendsLoading;
		},
		get groupsLoading() {
			return ui.groupsLoading;
		},
		get requestsLoading() {
			return ui.requestsLoading;
		},
		get friendError() {
			return ui.friendError;
		},
		set friendError(value: string) {
			ui.friendError = value;
		},
		get friendNotice() {
			return ui.friendNotice;
		},
		set friendNotice(value: string) {
			ui.friendNotice = value;
		},
		get friendsError() {
			return ui.friendsError;
		},
		get groupsError() {
			return ui.groupsError;
		},
		set groupsError(value: string) {
			ui.groupsError = value;
		},
		get requestsError() {
			return ui.requestsError;
		},
		get actionLoadingId() {
			return ui.actionLoadingId;
		},
		get groupLoadingId() {
			return ui.groupLoadingId;
		},
		get sendFriendIdInput() {
			return ui.sendFriendIdInput;
		},
		set sendFriendIdInput(value: string) {
			ui.sendFriendIdInput = value;
		},
		get sendFriendExpiry() {
			return ui.sendFriendExpiry;
		},
		set sendFriendExpiry(value: string) {
			ui.sendFriendExpiry = value;
		},
		get sendFriendVisibility() {
			return ui.sendFriendVisibility;
		},
		set sendFriendVisibility(value: typeof ui.sendFriendVisibility) {
			ui.sendFriendVisibility = value;
		},
		get acceptFriendVisibility() {
			return ui.acceptFriendVisibility;
		},
		get friendActions() {
			return ui.friendActions!;
		},
		get groupActions() {
			return ui.groupActions!;
		}
	} satisfies ManagementState);
	async function plan(ids: string[], compare: boolean) {
		if (ui.meetingDraft?.submission) {
			ui.meetingEditorOpen = true;
			return;
		}
		ui.selected = [
			...(ui.selected.includes('you') ? ['you'] : []),
			...ids.filter((id) => ui.friends.some((friend) => friend.id === id))
		];
		ui.filtersManual = true;
		ui.comparison = compare;
		if (compare) ui.term = ui.currentTerm ?? ui.term;
		await goto(resolve(compare ? '/calendar' : '/friends'), { noScroll: true });
		await tick();
		document
			.querySelector<HTMLButtonElement>(compare ? '.comparison button' : '.planner .people button')
			?.focus();
	}
</script>

<FriendsManagement bind:open ui={management} onplan={(ids, compare) => void plan(ids, compare)} />
