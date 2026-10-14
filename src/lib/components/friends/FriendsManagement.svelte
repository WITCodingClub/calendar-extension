<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import { ADD_PERSON_ICON } from '$lib/icons';
	import {
		Button,
		Checkbox,
		ListItem,
		SelectOutlined,
		TextFieldOutlined,
		VariableTabs
	} from 'm3-svelte';
	import {
		CAMPUS_TIME_ZONE,
		calendarDateTime,
		campusDate,
		endOfCampusDay,
		formatCampusDate,
		todayDate
	} from '$lib/datetime';
	import type { ManagementState } from '$lib/friends/management';
	import RequestCard from './RequestCard.svelte';
	import { requestInputMessage, sharingLabel, sharingLevel } from '$lib/friends/parse';
	import type { SharingLevel } from '$lib/types';
	let {
		open = $bindable(false),
		ui,
		onplan
	}: {
		open?: boolean;
		ui: ManagementState;
		onplan: (ids: string[], compare: boolean) => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let tab = $state('people');
	let search = $state('');
	let groupSearch = $state('');
	let memberSearch = $state('');
	let personGroups = $state<string[]>([]);
	let saving = $state(false);
	let confirmation = $state('');
	let confirmAction = $state<() => Promise<void>>();
	let leaving = $state<() => void>();
	let personId = $state<string>();
	let groupId = $state<string>();
	let adding = $state(false);
	let editingGroup = $state(false);
	let groupName = $state('');
	let groupMembers = $state<string[]>([]);
	let groupExpiryDate = $state('');
	let initialGroupExpiryDate = $state('');
	let refreshing = $state(false);
	let saveStatus = $state('No changes');
	let pendingExpiries = $state<Record<string, { date: string }>>({});
	let requestEdits = $state<Record<string, { dirty: boolean; originalSharing: SharingLevel }>>({});
	let requestDiscardVersion = $state(0);
	const activePerson = $derived(ui.friends.find((person) => person.id === personId));
	const searchedFriends = $derived(
		ui.friends.filter((person) => person.name.toLowerCase().includes(search.toLowerCase()))
	);
	const searchedMembers = $derived(
		ui.friends.filter((person) => person.name.toLowerCase().includes(memberSearch.toLowerCase()))
	);
	const searchedGroups = $derived(
		ui.groups.filter((group) => group.name.toLowerCase().includes(groupSearch.toLowerCase()))
	);
	const membershipChanged = $derived(
		!!personId &&
			ui.groups.some(
				(group) => group.members.includes(personId!) !== personGroups.includes(group.id)
			)
	);
	const busy = $derived(saving || !!ui.actionLoadingId || !!ui.groupLoadingId);
	const activeGroup = $derived(ui.groups.find((group) => group.id === groupId));
	const unavailableGroup = $derived(editingGroup && !!groupId && !activeGroup);
	const groupChanged = $derived(
		!activeGroup ||
			groupName.trim() !== activeGroup.name ||
			groupExpiryDate !== initialGroupExpiryDate ||
			groupMembers.length !== activeGroup.members.length ||
			groupMembers.some((id) => !activeGroup.members.includes(id))
	);
	const groupError = $derived(
		ui.groupsError ||
			(tab === 'groups' && unavailableGroup
				? 'This group is no longer available. Your friendships remain.'
				: '')
	);
	const sharingOptions = [
		{ text: 'Full schedule', value: 'full' },
		{ text: 'Availability only', value: 'availability_only' }
	];
	let ownSharing = $derived<SharingLevel | ''>(activePerson?.visibility?.mine ?? '');
	const theirSharing = $derived(
		activePerson?.visibility?.theirs === 'full'
			? 'Shares their full schedule with you'
			: activePerson?.visibility?.theirs === 'availability_only'
				? 'Shares their availability with you'
				: 'Sharing unavailable'
	);
	const currentExpiry = $derived(
		activePerson?.expires_at ? campusDate(activePerson.expires_at) : ''
	);
	let expiryDate = $derived(currentExpiry);
	const sharingChanged = $derived(
		!!sharingLevel(ownSharing) && ownSharing !== activePerson?.visibility?.mine
	);
	const expiryChanged = $derived(expiryDate !== currentExpiry);
	const dirty = $derived(
		(!!activePerson && (sharingChanged || expiryChanged || membershipChanged)) ||
			(editingGroup && groupChanged) ||
			(tab === 'requests' &&
				[...ui.incomingRequests, ...ui.outgoingRequests].some(
					(request) => requestEdits[request.request_id]?.dirty
				))
	);

	const requestCount = $derived(ui.incomingRequests.length + ui.outgoingRequests.length);
	const inputMessage = $derived(
		ui.sendFriendIdInput ? requestInputMessage(ui.sendFriendIdInput) : undefined
	);

	$effect(() => {
		if (!open) {
			ui.friendError = '';
			ui.friendNotice = '';
		}
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function editGroup(id?: string) {
		if (ui.groupLoadingId) return;
		const group = ui.groups.find((group) => group.id === id);
		groupId = id;
		groupName = group?.name ?? '';
		groupMembers = [...(group?.members ?? [])];
		groupExpiryDate = group?.expires_at ? campusDate(group.expires_at) : '';
		initialGroupExpiryDate = groupExpiryDate;
		ui.groupsError = '';
		memberSearch = '';
		saveStatus = 'No changes';
		ui.friendNotice = '';
		ui.friendError = '';
		editingGroup = true;
	}

	async function saveGroup() {
		const name = groupName.trim();
		if (!name || ui.groupLoadingId || unavailableGroup) return;
		const expiresAt =
			groupExpiryDate !== initialGroupExpiryDate ? groupExpiryDate || null : undefined;
		if (expiresAt) {
			try {
				calendarDateTime(expiresAt, '00:00');
				if (expiresAt < todayDate(CAMPUS_TIME_ZONE))
					throw new Error('Choose today or a future end date.');
			} catch (error) {
				ui.groupsError = error instanceof Error ? error.message : 'Choose a valid end date.';
				return;
			}
		}
		if (!(await ui.groupActions?.save(name, [...groupMembers], groupId, expiresAt))) return;
		editingGroup = false;
		groupId = undefined;
	}

	async function deleteGroup() {
		if (!groupId || ui.groupLoadingId || unavailableGroup) return;
		if (!(await ui.groupActions?.remove(groupId))) return;
		editingGroup = false;
		groupId = undefined;
	}

	function selectPerson(id: string) {
		personId = id;
		saveStatus = 'No changes';
		ui.friendNotice = '';
		ui.friendError = '';
		ui.groupsError = '';
		personGroups = ui.groups.filter((group) => group.members.includes(id)).map((group) => group.id);
	}

	function resetPerson() {
		ownSharing = activePerson?.visibility?.mine ?? '';
		expiryDate = currentExpiry;
		personGroups = ui.groups
			.filter((group) => group.members.includes(personId ?? ''))
			.map((group) => group.id);
	}

	function leave(action: () => void) {
		if (busy) return;
		if (dirty) {
			leaving = action;
			confirmation = 'Discard your unsaved changes?';
		} else action();
	}
	function discardRequestEdits() {
		for (const request of ui.incomingRequests) {
			const edit = requestEdits[request.request_id];
			if (edit) ui.acceptFriendVisibility[request.request_id] = edit.originalSharing;
		}
		requestEdits = {};
		requestDiscardVersion++;
	}

	function confirm(message: string, action: () => Promise<void>) {
		ui.friendError = '';
		ui.groupsError = '';
		confirmation = message;
		confirmAction = action;
	}

	function expiryAction(date: string, current?: string | null) {
		if (date === (current ? campusDate(current) : '')) return 'Expiry unchanged';
		if (!date && current) return 'Propose no expiry';
		if (date && !current) return 'Set expiry';
		return date && current && date < campusDate(current)
			? 'Apply earlier expiry'
			: 'Propose later expiry';
	}

	const personExpiryAction = $derived(expiryAction(expiryDate, activePerson?.expires_at));
	async function saveExpiry(id: string, date = expiryDate) {
		ui.friendNotice = '';
		try {
			const value = date ? endOfCampusDay(date) : null;
			if (value && Date.parse(value) <= Date.now())
				throw new Error('Choose today or a future expiry date.');
			await ui.friendActions?.setExpiry(id, value);
			if (ui.friendError) return false;
			if (/proposal/i.test(ui.friendNotice)) pendingExpiries[id] = { date };
			else if (value) delete pendingExpiries[id];
			return true;
		} catch (error) {
			ui.friendError = error instanceof Error ? error.message : 'Could not update expiry.';
			return false;
		}
	}

	async function saveFriendSettings(id: string) {
		if (busy) return;
		const sharing = ownSharing;
		const date = expiryChanged ? expiryDate : undefined;
		const proposal = date !== undefined && personExpiryAction.startsWith('Propose');
		saving = true;
		ui.friendError = '';
		ui.friendNotice = '';
		try {
			if (date) {
				const value = endOfCampusDay(date);
				if (Date.parse(value) <= Date.now())
					throw new Error('Choose today or a future expiry date.');
			}
			if (sharingChanged && sharingLevel(sharing)) await ui.friendActions.setSharing(id, sharing);
			if (ui.friendError) return;
			for (const group of ui.groups) {
				if (group.members.includes(id) === personGroups.includes(group.id)) continue;
				const members = personGroups.includes(group.id)
					? [...group.members, id]
					: group.members.filter((member) => member !== id);
				if (!(await ui.groupActions.save(group.name, members, group.id))) return;
			}
			if (date !== undefined) await saveExpiry(id, date);
			if (!ui.friendError) {
				saveStatus =
					proposal && /proposal/i.test(ui.friendNotice)
						? 'Changes saved · Expiry proposal submitted'
						: 'Changes saved';
				resetPerson();
			}
		} catch (error) {
			ui.friendError = error instanceof Error ? error.message : 'Could not save changes.';
		} finally {
			saving = false;
		}
	}
	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await ui.friendActions?.reload();
		} finally {
			refreshing = false;
		}
	}

	function planWithPerson(compare = false) {
		if (!personId) return;
		leave(() => {
			onplan([personId!], compare);
			open = false;
		});
	}

	function planWithGroup() {
		if (!activeGroup) return;
		const ids = activeGroup.members.filter((id) => ui.friends.some((person) => person.id === id));
		leave(() => {
			onplan(ids, false);
			open = false;
		});
	}

	let confirmDialog: HTMLDialogElement;
	$effect(() => {
		if (confirmation && !confirmDialog.open) confirmDialog.showModal();
	});
	function closeConfirmation() {
		confirmation = '';
		confirmAction = undefined;
		leaving = undefined;
		confirmDialog.close();
	}
</script>

{#snippet addIcon()}<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
		><path fill="currentColor" d={ADD_PERSON_ICON} /></svg
	>{/snippet}
{#snippet backIcon()}<svg aria-hidden="true" viewBox="0 0 24 24"
		><path
			fill="currentColor"
			d="m7.825 13l4.9 4.9q.3.3.288.7t-.313.7q-.3.275-.7.288t-.7-.288l-6.6-6.6q-.15-.15-.213-.325T4.426 12t.063-.375t.212-.325l6.6-6.6q.275-.275.688-.275t.712.275q.3.3.3.713t-.3.712L7.825 11H19q.425 0 .713.288T20 12t-.288.713T19 13z"
		/></svg
	>{/snippet}
{#snippet removeIcon()}<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
		><path
			fill="currentColor"
			d="M12.5 11.95q.725-.8 1.113-1.825T14 8t-.387-2.125T12.5 4.05q1.5.2 2.5 1.325T16 8t-1 2.625t-2.5 1.325M17.45 20q.275-.45.413-.962T18 18v-1q0-.9-.4-1.713t-1.05-1.437q1.275.45 2.363 1.163T20 17v1q0 .825-.587 1.413T18 20zM23 11h-4q-.425 0-.712-.288T18 10t.288-.712T19 9h4q.425 0 .713.288T24 10t-.288.713T23 11m-17.825-.175Q4 9.65 4 8t1.175-2.825T8 4t2.825 1.175T12 8t-1.175 2.825T8 12t-2.825-1.175M0 18v-.8q0-.85.438-1.562T1.6 14.55q1.55-.775 3.15-1.162T8 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T16 17.2v.8q0 .825-.587 1.413T14 20H2q-.825 0-1.412-.587T0 18"
		/></svg
	>{/snippet}

<dialog
	bind:this={dialog}
	class="preview-drawer inset-y-0 right-0 m-0 bg-surface-container-low p-0 text-on-surface backdrop:bg-scrim/35 min-[481px]:rounded-l-2xl fixed left-auto h-dvh max-h-dvh w-full max-w-[30rem] rounded-none border-0 open:flex open:flex-col"
	aria-labelledby="preview-manage-title"
	onclose={() => (open = false)}
	oncancel={(event) => {
		event.preventDefault();
		leave(() => (open = false));
	}}
>
	<header class="gap-2 p-5 flex shrink-0 items-center justify-between">
		<h2 id="preview-manage-title">Manage friends</h2>
		<Button
			variant="text"
			iconType="full"
			aria-label="Close manage friends"
			onclick={() => leave(() => (open = false))}
		>
			<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"
				><path
					fill="currentColor"
					d="m18.3 5.71-1.41-1.42L12 9.17 7.11 4.29 5.7 5.71 10.59 10.6 5.7 15.49l1.41 1.42L12 12.01l4.89 4.9 1.41-1.42-4.89-4.89z"
				/></svg
			>
		</Button>
	</header>
	<VariableTabs
		secondary
		bind:tab={
			() => tab,
			(value) => {
				if (value === tab) return;
				leave(() => {
					tab = value;
					ui.friendNotice = '';
					ui.friendError = '';
					ui.groupsError = '';
					personId = undefined;
					editingGroup = false;
					adding = false;
				});
				queueMicrotask(() => {
					for (const input of dialog.querySelectorAll<HTMLInputElement>(
						':scope > .m3-container input[type="radio"]'
					)) {
						input.checked = input.value === tab;
					}
				});
			}
		}
		items={[
			{ name: 'People', value: 'people' },
			{ name: 'Groups', value: 'groups' },
			{ name: requestCount ? `Requests (${requestCount})` : 'Requests', value: 'requests' }
		]}
	/>
	<div class="min-h-0 p-4 [&>*+*]:mt-4 flex-1 overflow-y-auto overscroll-contain">
		{#if tab === 'people'}
			{#if activePerson}
				<div class="gap-2 flex items-center">
					<Button
						variant="text"
						iconType="full"
						aria-label="All people"
						title="All people"
						onclick={() => leave(() => (personId = undefined))}>{@render backIcon()}</Button
					>
					<div class="min-w-0">
						<h3 class="text-lg truncate">{activePerson.name}</h3>
						<p class="text-sm text-on-surface-variant">
							{theirSharing} ·
							<span class="whitespace-nowrap"
								>{activePerson.expires_at
									? `Expires ${formatCampusDate(activePerson.expires_at)}`
									: 'No expiry'}</span
							>
						</p>
					</div>
				</div>
				<div class="gap-2 flex flex-wrap *:grow">
					<Button variant="tonal" onclick={() => planWithPerson(true)}>Compare calendars</Button>
					<Button variant="outlined" onclick={() => planWithPerson()}>Find a time together</Button>
				</div>
				<section class="gap-3 border-outline-variant pt-4 grid border-t">
					<h4 class="text-xs font-semibold text-primary">What you share</h4>
					<p class="text-sm text-on-surface-variant">
						Full schedule includes class details. Availability only shows busy times for planning.
					</p>
					<div class="preview-form-stack min-w-0 gap-4 grid">
						<SelectOutlined
							label="Your schedule sharing"
							bind:value={ownSharing}
							options={ownSharing
								? sharingOptions
								: [{ text: 'Choose sharing', value: '' }, ...sharingOptions]}
							disabled={busy}
						/>
						<DateField
							label="Friendship end date (optional)"
							min={todayDate(CAMPUS_TIME_ZONE)}
							disabled={busy}
							bind:value={expiryDate}
						/>
					</div>
					<p class="text-sm text-on-surface-variant">
						Extending or removing an expiry sends an email proposal for approval in the web
						dashboard.
					</p>
					{#if pendingExpiries[activePerson.id]}
						<p class="text-sm text-primary">
							Pending expiry proposal: {pendingExpiries[activePerson.id].date
								? formatCampusDate(pendingExpiries[activePerson.id].date)
								: 'no expiry'}. Current expiry stays until approval.
						</p>
					{/if}
					{#if expiryChanged}<p class="text-sm text-primary">
							On save: {personExpiryAction.toLowerCase()}.
						</p>{/if}
				</section>
				{#if ui.groups.length}
					<section class="gap-1 border-outline-variant pt-4 grid border-t">
						<h4 class="text-xs font-semibold text-primary">Private groups</h4>
						<ul class="preview-list p-0 list-none">
							{#each ui.groups as group (group.id)}
								<ListItem label headline={group.name}>
									{#snippet leading()}<Checkbox
											><input
												type="checkbox"
												bind:group={personGroups}
												value={group.id}
												disabled={ui.groupsLoading || busy}
											/></Checkbox
										>{/snippet}
								</ListItem>
							{/each}
						</ul>
					</section>
				{/if}
				<div
					class="border-outline-variant pt-4 border-t"
					style="--m3-scheme-primary: var(--m3-scheme-error)"
				>
					<Button
						variant="text"
						iconType="left"
						disabled={busy}
						onclick={() =>
							confirm(
								`Remove ${activePerson.name}? Sharing stops for both of you. Reconnecting requires a new friend request.`,
								async () => {
									await ui.friendActions.remove(activePerson.id);
									if (!ui.friendError) personId = undefined;
								}
							)}>{@render removeIcon()}Remove friend</Button
					>
				</div>
			{:else if adding}
				<div class="gap-3 flex items-center justify-between">
					<h3>Add friend</h3>
					<Button variant="text" onclick={() => (adding = false)}>Cancel</Button>
				</div>
				<div class="preview-form-stack min-w-0 gap-4 grid">
					<TextFieldOutlined
						label="Email or user ID"
						error={Boolean(inputMessage)}
						bind:value={ui.sendFriendIdInput}
						onkeydown={(event) => {
							if (event.key === 'Enter' && !ui.actionLoadingId && ui.sendFriendIdInput.trim())
								void ui.friendActions?.send();
						}}
					/>
					{#if inputMessage}<p class="text-sm text-error" role="status">{inputMessage}</p>{/if}
					<SelectOutlined
						label="Your schedule sharing"
						bind:value={ui.sendFriendVisibility}
						options={sharingOptions}
						disabled={busy}
					/>
					<DateField
						label="Friendship end date (optional)"
						min={todayDate(CAMPUS_TIME_ZONE)}
						bind:value={ui.sendFriendExpiry}
					/>
					<Button
						iconType="left"
						disabled={!ui.sendFriendIdInput.trim() || ui.actionLoadingId !== ''}
						onclick={async () => {
							await ui.friendActions?.send();
							if (!ui.friendError) adding = false;
						}}>{@render addIcon()}Send request</Button
					>
				</div>
			{:else}
				<div class="gap-3 flex flex-wrap items-center justify-between">
					<h2>People</h2>
					<Button variant="tonal" iconType="left" onclick={() => (adding = true)}
						>{@render addIcon()}Add friend</Button
					>
				</div>
				<div class="preview-form-stack min-w-0 grid">
					<TextFieldOutlined label="Search people" type="search" bind:value={search} />
					{#if search}<Button variant="text" onclick={() => (search = '')}
							>Clear People search</Button
						>{/if}
				</div>
				{#if ui.friendsLoading}<p class="text-sm text-on-surface-variant" role="status">
						Loading friends…
					</p>
				{:else if !ui.friends.length}<p class="text-sm text-on-surface-variant">
						Add a friend to start planning together.
					</p>{/if}
				{#if !ui.friendsLoading && search && !searchedFriends.length}<p role="status">
						No people match “{search}”.
					</p>{/if}
				<ul class="preview-list p-0 list-none">
					{#each searchedFriends as person (person.id)}
						<ListItem
							headline={person.name}
							supporting={`They share: ${sharingLabel(person.visibility?.theirs)}${person.expires_at ? ` · Expires ${formatCampusDate(person.expires_at)}` : ''}`}
							onclick={() => selectPerson(person.id)}
						/>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'groups'}
			{#if ui.groupsLoading}<p class="text-sm text-on-surface-variant" role="status">
					Loading groups…
				</p>{/if}
			{#if editingGroup}
				<div class="gap-2 flex items-center">
					<Button
						variant="text"
						iconType="full"
						aria-label="All groups"
						title="All groups"
						disabled={busy}
						onclick={() => leave(() => (editingGroup = false))}>{@render backIcon()}</Button
					>
					<div class="min-w-0">
						<h3 class="text-lg truncate">
							{groupId ? (activeGroup?.name ?? groupName) : 'Create group'}
						</h3>
						<p class="text-sm text-on-surface-variant">
							{groupMembers.length}
							{groupMembers.length === 1 ? 'member' : 'members'} ·
							<span class="whitespace-nowrap"
								>{activeGroup?.expires_at
									? `Ends on ${formatCampusDate(activeGroup.expires_at)}`
									: 'No end date'}</span
							>
						</p>
					</div>
				</div>
				{#if activeGroup}
					<div class="gap-2 flex flex-wrap *:grow">
						<Button
							variant="outlined"
							disabled={busy || !activeGroup?.members.length}
							onclick={planWithGroup}>Find a time with this group</Button
						>
					</div>
				{/if}
				<section class="gap-3 border-outline-variant pt-4 grid border-t">
					<h4 class="text-xs font-semibold text-primary">Group settings</h4>
					<div class="preview-form-stack min-w-0 gap-4 grid">
						<TextFieldOutlined
							label="Group name"
							maxlength={50}
							disabled={busy || unavailableGroup}
							bind:value={groupName}
						/>
						<DateField
							label="Group end date (optional)"
							min={todayDate(CAMPUS_TIME_ZONE)}
							disabled={busy || unavailableGroup}
							bind:value={groupExpiryDate}
						/>
					</div>
					<p class="text-xs text-on-surface-variant">
						When the end date passes, the group disappears. Your friendships remain.
					</p>
				</section>
				<section class="gap-3 border-outline-variant pt-4 grid border-t">
					<h4 class="text-xs font-semibold text-primary">Members</h4>
					<div class="preview-form-stack min-w-0 grid">
						<TextFieldOutlined
							label="Search friends to add"
							type="search"
							bind:value={memberSearch}
						/>
						{#if memberSearch}<Button variant="text" onclick={() => (memberSearch = '')}
								>Clear member search</Button
							>{/if}
						{#if memberSearch && !searchedMembers.length}<p role="status">
								No friends match “{memberSearch}”.
							</p>{/if}
					</div>
					<ul class="preview-list p-0 list-none">
						{#each searchedMembers as person (person.id)}
							<ListItem label headline={person.name}
								>{#snippet leading()}<Checkbox
										><input
											type="checkbox"
											disabled={busy || unavailableGroup}
											bind:group={groupMembers}
											value={person.id}
										/></Checkbox
									>{/snippet}</ListItem
							>
						{/each}
					</ul>
				</section>
				{#if groupId}
					<div
						class="border-outline-variant pt-4 border-t"
						style="--m3-scheme-primary: var(--m3-scheme-error)"
					>
						<Button
							variant="text"
							iconType="left"
							disabled={busy || unavailableGroup}
							onclick={() =>
								confirm(
									'Delete this private group? Your friendships remain. This cannot be undone.',
									deleteGroup
								)}>{@render removeIcon()}Delete group</Button
						>
					</div>
				{/if}
			{:else}
				<div class="gap-3 flex flex-wrap items-center justify-between">
					<h2>Groups</h2>
					<Button
						variant="tonal"
						iconType="left"
						disabled={ui.groupsLoading || busy}
						onclick={() => editGroup()}>{@render addIcon()}Create group</Button
					>
				</div>
				<div class="preview-form-stack min-w-0 grid">
					<TextFieldOutlined label="Search groups" type="search" bind:value={groupSearch} />
					{#if groupSearch}<Button variant="text" onclick={() => (groupSearch = '')}
							>Clear group search</Button
						>{/if}
				</div>
				<p class="text-sm text-on-surface-variant">
					Only you can see your groups. No invitations are sent.
				</p>
				{#if !ui.groupsLoading && !searchedGroups.length}<p role="status">
						{groupSearch
							? `No groups match “${groupSearch}”.`
							: 'Create a private group to reuse a collection of friends.'}
					</p>{/if}
				<ul class="preview-list p-0 list-none">
					{#each searchedGroups as group (group.id)}
						<ListItem
							headline={group.name}
							supporting={`${group.members.length} members${group.expires_at ? ` · Ends on ${formatCampusDate(group.expires_at)}` : ''}`}
							onclick={() => editGroup(group.id)}
						/>
					{/each}
				</ul>
			{/if}
		{:else}
			<div class="gap-3 flex items-center justify-between">
				<h2>Requests</h2>
				<Button variant="text" disabled={refreshing || busy} onclick={() => void refresh()}
					>Refresh</Button
				>
			</div>
			{#if ui.requestsLoading}
				<p role="status">Loading friend requests…</p>
			{:else if !requestCount}
				<p class="text-sm text-on-surface-variant">No pending friend requests.</p>
			{:else}
				{#if ui.incomingRequests.length}
					<section class="request-section" aria-labelledby="incoming-title">
						<h3 id="incoming-title" class="text-xs font-semibold text-primary">
							Incoming · {ui.incomingRequests.length}
						</h3>
						{#each ui.incomingRequests as request (request.request_id)}
							<RequestCard
								discardVersion={requestDiscardVersion}
								onedit={(dirty, originalSharing) =>
									(requestEdits[request.request_id] = { dirty, originalSharing })}
								person={request.from}
								incoming
								createdAt={request.created_at}
								expiresAt={request.expires_at}
								{busy}
								working={ui.actionLoadingId === request.request_id}
								pendingExpiry={pendingExpiries[request.from.id]}
								bind:sharing={
									() => ui.acceptFriendVisibility[request.request_id] ?? 'full',
									(value) => (ui.acceptFriendVisibility[request.request_id] = value)
								}
								onaccept={() =>
									ui.friendActions.accept(
										request.request_id,
										ui.acceptFriendVisibility[request.request_id] ?? 'full'
									)}
								ondecline={() => ui.friendActions.decline(request.request_id)}
								onexpiry={(date) => saveExpiry(request.from.id, date)}
							/>
						{/each}
					</section>
				{/if}
				{#if ui.outgoingRequests.length}
					<section class="request-section" aria-labelledby="outgoing-title">
						<h3 id="outgoing-title" class="text-xs font-semibold text-primary">
							Outgoing · {ui.outgoingRequests.length}
						</h3>
						{#each ui.outgoingRequests as request (request.request_id)}
							<RequestCard
								discardVersion={requestDiscardVersion}
								onedit={(dirty, originalSharing) =>
									(requestEdits[request.request_id] = { dirty, originalSharing })}
								person={request.to}
								createdAt={request.created_at}
								expiresAt={request.expires_at}
								{busy}
								working={ui.actionLoadingId === request.request_id}
								pendingExpiry={pendingExpiries[request.to.id]}
								oncancel={() => ui.friendActions.cancel(request.request_id)}
								onexpiry={(date) => saveExpiry(request.to.id, date)}
							/>
						{/each}
					</section>
				{/if}
			{/if}
		{/if}
	</div>
	<footer class="management-footer">
		{#if ui.friendError || ui.friendsError || ui.requestsError || groupError}
			<p class="text-sm text-error" role="alert">
				{[ui.friendError, ui.friendsError, ui.requestsError, groupError].filter(Boolean).join(' ')}
			</p>
			{#if activePerson}<p class="text-xs text-on-surface-variant">
					Some updates may be saved. Cancel discards only unsaved edits.
				</p>{/if}
		{/if}
		{#if activePerson || editingGroup}
			<p class="text-sm text-on-surface-variant" role="status">
				{busy ? 'Saving…' : dirty ? 'Unsaved changes' : saveStatus}
			</p>
			<div class="gap-2 flex flex-wrap justify-end">
				<Button
					variant="text"
					disabled={busy}
					onclick={() => {
						if (activePerson) {
							resetPerson();
							personId = undefined;
						} else editingGroup = false;
					}}>Cancel</Button
				>
				<Button
					disabled={busy || !dirty || (editingGroup && (!groupName.trim() || unavailableGroup))}
					onclick={() => (activePerson ? saveFriendSettings(activePerson.id) : saveGroup())}
					>{busy ? 'Saving…' : editingGroup ? 'Save group' : 'Save changes'}</Button
				>
			</div>
		{:else}
			<p class="footer-status text-sm text-on-surface-variant" role="status">
				{busy
					? 'Working…'
					: dirty
						? 'Unsaved changes'
						: /proposal/i.test(ui.friendNotice)
							? 'Expiry proposal submitted'
							: ui.friendNotice}
			</p>
		{/if}
	</footer>
</dialog>

<dialog
	bind:this={confirmDialog}
	class="confirmation bg-surface-container-high text-on-surface"
	aria-labelledby="confirmation-title"
	oncancel={(event) => {
		event.preventDefault();
		closeConfirmation();
	}}
>
	<h3 id="confirmation-title">{confirmation}</h3>
	{#if ui.friendError || ui.groupsError}<p role="alert">{ui.friendError || ui.groupsError}</p>{/if}
	<div class="gap-2 mt-4 flex flex-wrap justify-end">
		<Button variant="text" disabled={busy} onclick={closeConfirmation}>Keep editing</Button>
		<Button
			disabled={busy}
			onclick={async () => {
				if (leaving) {
					const action = leaving;
					if (activePerson) resetPerson();
					if (editingGroup) editingGroup = false;
					if (tab === 'requests') discardRequestEdits();
					closeConfirmation();
					action();
				} else if (confirmAction) {
					await confirmAction();
					if (!ui.friendError && !ui.groupsError) closeConfirmation();
				}
			}}>{busy ? 'Working…' : leaving ? 'Discard changes' : 'Confirm'}</Button
		>
	</div>
</dialog>

<style>
	.management-footer {
		padding: 1rem;
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		flex-shrink: 0;
	}
	.management-footer p {
		margin: 0 0 0.5rem;
	}
	.confirmation {
		border: 0;
		border-radius: 1.5rem;
		padding: 1.5rem;
		position: fixed;
		inset: 0;
		margin: auto;
		width: min(26rem, calc(100vw - 2rem));
		max-width: calc(100vw - 2rem);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
	}
	.preview-drawer :global(.preview-list > li),
	.preview-drawer :global(.preview-list > li > .m3-container) {
		width: 100%;
	}
	.footer-status {
		min-height: 1.25rem;
	}
	.request-section {
		min-width: 0;
	}
	.confirmation::backdrop {
		background: rgb(var(--m3-scheme-scrim) / 0.35);
	}
</style>
