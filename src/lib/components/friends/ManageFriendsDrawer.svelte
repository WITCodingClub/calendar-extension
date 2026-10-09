<script lang="ts">
	import {
		Button,
		Checkbox,
		ListItem,
		SelectOutlined,
		TextFieldOutlined,
		VariableTabs
	} from 'm3-svelte';
	import { calendarDateTime, shiftDate, todayDate } from '$lib/calendarDates';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { requestInputMessage, sharingLabel, sharingLevel } from '$lib/friendData';
	import type { SharingLevel } from '$lib/types';
	let { open = $bindable(false) } = $props();
	const ui = getPanelUi();
	let dialog: HTMLDialogElement;
	let tab = $state('people');
	let search = $state('');
	let groupSearch = $state('');
	let personId = $state<string>();
	let groupId = $state<string>();
	let adding = $state(false);
	let editingGroup = $state(false);
	let groupName = $state('');
	let groupMembers = $state<string[]>([]);
	let groupExpiryDate = $state('');
	let initialGroupExpiryDate = $state('');
	let requestExpiry = $state<Record<string, string>>({});
	let refreshing = $state(false);
	const activePerson = $derived(ui.friends.find((person) => person.id === personId));
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
		activePerson?.expires_at
			? new Intl.DateTimeFormat('en-CA', {
					timeZone: 'America/New_York',
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				}).format(new Date(activePerson.expires_at))
			: ''
	);
	let expiryDate = $derived(currentExpiry);
	const sharingChanged = $derived(
		!!sharingLevel(ownSharing) && ownSharing !== activePerson?.visibility?.mine
	);
	const expiryChanged = $derived(expiryDate !== currentExpiry);
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
		groupExpiryDate = group?.expires_at
			? new Intl.DateTimeFormat('en-CA', {
					timeZone: 'America/New_York',
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				}).format(new Date(group.expires_at))
			: '';
		initialGroupExpiryDate = groupExpiryDate;
		ui.groupsError = '';
		search = '';
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
				if (expiresAt < todayDate('America/New_York'))
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

	async function toggleMember(id: string, input: HTMLInputElement) {
		const group = ui.groups.find((group) => group.id === id);
		if (!group || !personId) return;
		const checked = input.checked;
		input.checked = group.members.includes(personId);
		if (ui.groupLoadingId) return;
		const members = checked
			? [...new Set([...group.members, personId])]
			: group.members.filter((member) => member !== personId);
		await ui.groupActions?.save(group.name, members, id);
	}

	async function saveExpiry(id: string, date = expiryDate) {
		ui.friendNotice = '';
		try {
			const value = date
				? new Date(Date.parse(calendarDateTime(shiftDate(date, 1), '00:00')) - 1).toISOString()
				: null;
			if (value && Date.parse(value) <= Date.now())
				throw new Error('Choose today or a future expiry date.');
			await ui.friendActions?.setExpiry(id, value);
		} catch (error) {
			ui.friendError = error instanceof Error ? error.message : 'Could not update expiry.';
		}
	}

	async function saveFriendSettings(id: string) {
		const sharing = ownSharing;
		const date = expiryChanged ? expiryDate : undefined;
		ui.friendError = '';
		if (sharingChanged && sharingLevel(sharing)) await ui.friendActions?.setSharing(id, sharing);
		if (date !== undefined && !ui.friendError) await saveExpiry(id, date);
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
		ui.selected = ['you', personId];
		ui.highlightedSlot = undefined;
		ui.comparison = compare;
		if (compare) ui.term = ui.currentTerm ?? ui.term;
		open = false;
		if (compare) void goto(resolve('/calendar'));
		else void goto(resolve('/friends'));
	}
</script>

{#snippet addIcon()}<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
		><path
			fill="currentColor"
			d="M12.5 11.95q.725-.8 1.113-1.825T14 8t-.387-2.125T12.5 4.05q1.5.2 2.5 1.325T16 8t-1 2.625t-2.5 1.325M17.45 20q.275-.45.413-.962T18 18v-1q0-.9-.4-1.713t-1.05-1.437q1.275.45 2.363 1.163T20 17v1q0 .825-.587 1.413T18 20zM20 11h-1q-.425 0-.712-.288T18 10t.288-.712T19 9h1V8q0-.425.288-.712T21 7t.713.288T22 8v1h1q.425 0 .713.288T24 10t-.288.713T23 11h-1v1q0 .425-.288.713T21 13t-.712-.288T20 12zm-14.825-.175Q4 9.65 4 8t1.175-2.825T8 4t2.825 1.175T12 8t-1.175 2.825T8 12t-2.825-1.175M0 18v-.8q0-.85.438-1.562T1.6 14.55q1.55-.775 3.15-1.162T8 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T16 17.2v.8q0 .825-.587 1.413T14 20H2q-.825 0-1.412-.587T0 18"
		/></svg
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
>
	<header class="gap-2 p-5 flex shrink-0 items-center justify-between">
		<h2 id="preview-manage-title">Manage friends</h2>
		<Button
			variant="text"
			iconType="full"
			aria-label="Close manage friends"
			onclick={() => (open = false)}
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
		bind:tab
		items={[
			{ name: 'People', value: 'people' },
			{ name: 'Groups', value: 'groups' },
			{ name: requestCount ? `Requests (${requestCount})` : 'Requests', value: 'requests' }
		]}
	/>
	<div class="min-h-0 p-4 [&>*+*]:mt-4 flex-1 overflow-y-auto overscroll-contain">
		{#if groupError && (tab === 'groups' || activePerson)}
			<div class="rounded-xl bg-error-container p-3 text-sm text-on-error-container" role="alert">
				<p>{groupError}</p>
				<Button
					variant="text"
					disabled={ui.groupsLoading || !!ui.groupLoadingId}
					onclick={() => ui.groupActions?.reload()}>Reload groups</Button
				>
			</div>
		{/if}
		{#if ui.friendError || ui.friendsError || ui.requestsError}<div
				class="rounded-xl bg-error-container p-3 text-sm text-on-error-container"
				role="alert"
			>
				{#each [ui.friendError, ui.friendsError, ui.requestsError].filter(Boolean) as message (message)}
					<p>{message}</p>
				{/each}
				<Button variant="text" onclick={() => ui.friendActions?.reload()}>Try again</Button>
			</div>{/if}
		{#if ui.friendNotice}<p class="text-sm text-on-surface-variant" role="status">
				{ui.friendNotice}
			</p>{/if}
		{#if tab === 'people'}
			{#if activePerson}
				<div class="gap-2 flex items-center">
					<Button
						variant="text"
						iconType="full"
						aria-label="All people"
						title="All people"
						onclick={() => (personId = undefined)}>{@render backIcon()}</Button
					>
					<div class="min-w-0">
						<h3 class="text-lg truncate">{activePerson.name}</h3>
						<p class="text-sm text-on-surface-variant">
							{theirSharing} ·
							<span class="whitespace-nowrap"
								>{activePerson.expires_at
									? `Expires ${new Date(activePerson.expires_at).toLocaleDateString(undefined, { timeZone: 'America/New_York' })}`
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
					<h4 class="text-xs font-semibold text-primary">Your settings</h4>
					<div class="preview-form-stack min-w-0 gap-4 grid">
						<SelectOutlined
							label="What you share"
							bind:value={ownSharing}
							options={ownSharing
								? sharingOptions
								: [{ text: 'Choose sharing', value: '' }, ...sharingOptions]}
							disabled={ui.actionLoadingId !== ''}
						/>
						<TextFieldOutlined
							label="Friendship expires (optional)"
							type="date"
							min={todayDate('America/New_York')}
							bind:value={expiryDate}
						/>
					</div>
					<div class="flex justify-end">
						<Button
							disabled={ui.actionLoadingId !== '' || !(sharingChanged || expiryChanged)}
							onclick={() => saveFriendSettings(activePerson.id)}>Save changes</Button
						>
					</div>
				</section>
				{#if ui.groups.length}
					<section class="gap-1 border-outline-variant pt-4 grid border-t">
						<h4 class="text-xs font-semibold text-primary">Groups</h4>
						<ul class="preview-list p-0 list-none">
							{#each ui.groups as group (group.id)}
								<ListItem label headline={group.name}>
									{#snippet leading()}<Checkbox
											><input
												type="checkbox"
												checked={group.members.includes(activePerson.id)}
												disabled={ui.groupsLoading || !!ui.groupLoadingId}
												onchange={(event) => toggleMember(group.id, event.currentTarget)}
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
						disabled={ui.actionLoadingId !== ''}
						onclick={async () => {
							await ui.friendActions?.remove(activePerson.id);
							if (!ui.friends.some((person) => person.id === personId)) personId = undefined;
						}}>{@render removeIcon()}Remove friend</Button
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
						label="What you share"
						bind:value={ui.sendFriendVisibility}
						options={sharingOptions}
						disabled={ui.actionLoadingId !== ''}
					/>
					<TextFieldOutlined
						label="Friendship expires (optional)"
						type="date"
						min={todayDate('America/New_York')}
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
					<TextFieldOutlined label="Search friends" type="search" bind:value={search} />
				</div>
				{#if ui.friendsLoading}<p class="text-sm text-on-surface-variant" role="status">
						Loading friends…
					</p>
				{:else if !ui.friends.length}<p class="text-sm text-on-surface-variant">
						Add a friend to start planning together.
					</p>{/if}
				<ul class="preview-list p-0 list-none">
					{#each ui.friends.filter((person) => person.name
							.toLowerCase()
							.includes(search.toLowerCase())) as person (person.id)}
						<ListItem
							headline={person.name}
							supporting={`${sharingLabel(person.visibility?.theirs)}${person.expires_at ? ` · Expires ${new Date(person.expires_at).toLocaleDateString(undefined, { timeZone: 'America/New_York' })}` : ''}`}
							onclick={() => (personId = person.id)}
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
						disabled={!!ui.groupLoadingId}
						onclick={() => (editingGroup = false)}>{@render backIcon()}</Button
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
									? `Ends on ${new Date(activeGroup.expires_at).toLocaleDateString(undefined, { timeZone: 'America/New_York' })}`
									: 'No end date'}</span
							>
						</p>
					</div>
				</div>
				<section class="gap-3 border-outline-variant pt-4 grid border-t">
					<h4 class="text-xs font-semibold text-primary">Group settings</h4>
					<div class="preview-form-stack min-w-0 gap-4 grid">
						<TextFieldOutlined
							label="Group name"
							maxlength={50}
							disabled={!!ui.groupLoadingId || unavailableGroup}
							bind:value={groupName}
						/>
						<TextFieldOutlined
							label="Group end date (optional)"
							type="date"
							min={todayDate('America/New_York')}
							disabled={!!ui.groupLoadingId || unavailableGroup}
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
						<TextFieldOutlined label="Search members" type="search" bind:value={search} />
					</div>
					<ul class="preview-list p-0 list-none">
						{#each ui.friends.filter((person) => person.name
								.toLowerCase()
								.includes(search.toLowerCase())) as person (person.id)}
							<ListItem label headline={person.name}
								>{#snippet leading()}<Checkbox
										><input
											type="checkbox"
											disabled={!!ui.groupLoadingId || unavailableGroup}
											bind:group={groupMembers}
											value={person.id}
										/></Checkbox
									>{/snippet}</ListItem
							>
						{/each}
					</ul>
					<div class="flex justify-end">
						<Button
							disabled={!groupName.trim() ||
								!groupChanged ||
								ui.groupsLoading ||
								!!ui.groupLoadingId ||
								unavailableGroup}
							onclick={saveGroup}>{ui.groupLoadingId ? 'Saving…' : 'Save group'}</Button
						>
					</div>
				</section>
				{#if groupId}
					<div
						class="border-outline-variant pt-4 border-t"
						style="--m3-scheme-primary: var(--m3-scheme-error)"
					>
						<Button
							variant="text"
							iconType="left"
							disabled={!!ui.groupLoadingId || unavailableGroup}
							onclick={deleteGroup}>{@render removeIcon()}Delete group</Button
						>
					</div>
				{/if}
			{:else}
				<div class="gap-3 flex flex-wrap items-center justify-between">
					<h2>Groups</h2>
					<Button
						variant="tonal"
						iconType="left"
						disabled={ui.groupsLoading || !!ui.groupLoadingId}
						onclick={() => editGroup()}>{@render addIcon()}Create group</Button
					>
				</div>
				<div class="preview-form-stack min-w-0 grid">
					<TextFieldOutlined label="Search Groups" type="search" bind:value={groupSearch} />
				</div>
				<p class="text-sm text-on-surface-variant">Only you can see your groups.</p>
				<ul class="preview-list p-0 list-none">
					{#each ui.groups.filter((group) => group.name
							.toLowerCase()
							.includes(groupSearch.toLowerCase())) as group (group.id)}
						<ListItem
							headline={group.name}
							supporting={`${group.members.length} members${group.expires_at ? ` · Ends on ${new Date(group.expires_at).toLocaleDateString(undefined, { timeZone: 'America/New_York' })}` : ''}`}
							onclick={() => editGroup(group.id)}
						/>
					{/each}
				</ul>
			{/if}
		{:else}
			<div class="gap-3 flex flex-wrap items-center justify-between">
				{#if requestCount}<h2>Requests</h2>
				{:else if ui.requestsLoading}<p class="text-sm text-on-surface-variant" role="status">
						Loading requests…
					</p>
				{:else}<p class="text-sm text-on-surface-variant">No pending requests.</p>{/if}
				<div class="ml-auto shrink-0">
					<Button
						variant="tonal"
						disabled={refreshing || Boolean(ui.actionLoadingId || ui.groupLoadingId)}
						onclick={() => void refresh()}
						aria-label="Refresh friends"
						title="Refresh friends"
					>
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							viewBox="0 0 24 24"
							class:animate-spin={refreshing}
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
					</Button>
				</div>
			</div>
			{#if ui.incomingRequests.length}<h3>Incoming requests</h3>{/if}
			{#each ui.incomingRequests as request (request.request_id)}
				<section class="gap-3 border-outline-variant pb-4 grid border-b">
					<h4>{request.from.name}</h4>
					{#if request.expires_at}<p class="text-sm text-on-surface-variant">
							Expires {new Date(request.expires_at).toLocaleDateString(undefined, {
								timeZone: 'America/New_York'
							})}
						</p>{/if}

					<div class="preview-form-stack min-w-0 gap-2 grid">
						<SelectOutlined
							label={`What you share with ${request.from.name}`}
							value={ui.acceptFriendVisibility[request.request_id] ?? 'full'}
							options={sharingOptions}
							disabled={ui.actionLoadingId !== ''}
							onchange={(event) => {
								if (sharingLevel(event.currentTarget.value))
									ui.acceptFriendVisibility[request.request_id] = event.currentTarget.value;
							}}
						/>
						<TextFieldOutlined
							label={`New expiry for ${request.from.name} (optional)`}
							type="date"
							min={todayDate('America/New_York')}
							value={requestExpiry[request.request_id] ?? ''}
							onchange={(event) => (requestExpiry[request.request_id] = event.currentTarget.value)}
						/>
						<Button
							variant="text"
							disabled={ui.actionLoadingId !== ''}
							onclick={() => saveExpiry(request.from.id, requestExpiry[request.request_id] ?? '')}
							>Set or propose expiry</Button
						>
					</div>

					<div class="gap-2 flex flex-wrap">
						<Button
							variant="tonal"
							disabled={ui.actionLoadingId !== ''}
							onclick={() =>
								ui.friendActions?.accept(
									request.request_id,
									ui.acceptFriendVisibility[request.request_id] ?? 'full'
								)}>Accept</Button
						>
						<Button
							variant="text"
							disabled={ui.actionLoadingId !== ''}
							onclick={() => ui.friendActions?.decline(request.request_id)}>Decline</Button
						>
					</div>
				</section>
			{/each}
			{#if ui.outgoingRequests.length}
				<h3>Outgoing requests</h3>
				<ul class="preview-list p-0 list-none">
					{#each ui.outgoingRequests as request (request.request_id)}
						<ListItem
							headline={request.to.name}
							supporting={request.expires_at
								? `Pending · Expires ${new Date(request.expires_at).toLocaleDateString(undefined, { timeZone: 'America/New_York' })}`
								: 'Pending'}
						>
							{#snippet trailing()}<Button
									variant="text"
									disabled={ui.actionLoadingId !== ''}
									onclick={() => ui.friendActions?.cancel(request.request_id)}>Cancel</Button
								>{/snippet}
						</ListItem>

						<li class="preview-form-stack min-w-0 gap-2 pb-3 grid">
							<TextFieldOutlined
								label={`New expiry for ${request.to.name} (optional)`}
								type="date"
								min={todayDate('America/New_York')}
								value={requestExpiry[request.request_id] ?? ''}
								onchange={(event) =>
									(requestExpiry[request.request_id] = event.currentTarget.value)}
							/>
							<Button
								variant="text"
								disabled={ui.actionLoadingId !== ''}
								onclick={() => saveExpiry(request.to.id, requestExpiry[request.request_id] ?? '')}
								>Set or propose expiry</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</dialog>
