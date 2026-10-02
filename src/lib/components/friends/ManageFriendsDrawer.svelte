<script lang="ts">
	import { Button, Checkbox, ListItem, TextFieldOutlined, VariableTabs } from 'm3-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getPanelUi } from '$lib/panelUi.svelte';
	let { open = $bindable(false) } = $props();
	const ui = getPanelUi();
	let dialog: HTMLDialogElement;
	let tab = $state('people');
	let search = $state('');
	let personId = $state<string>();
	let groupId = $state<string>();
	let adding = $state(false);
	let editingGroup = $state(false);
	let groupName = $state('');
	let groupMembers = $state<string[]>([]);
	const activePerson = $derived(ui.friends.find((person) => person.id === personId));
	const requestCount = $derived(ui.incomingRequests.length + ui.outgoingRequests.length);

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	function editGroup(id?: string) {
		const group = ui.groups.find((group) => group.id === id);
		groupId = id;
		groupName = group?.name ?? '';
		groupMembers = [...(group?.members ?? [])];
		search = '';
		editingGroup = true;
	}

	function saveGroup() {
		const name = groupName.trim();
		if (!name) return;
		const group = { id: groupId ?? crypto.randomUUID(), name, members: [...groupMembers] };
		ui.groups = groupId
			? ui.groups.map((item) => (item.id === groupId ? group : item))
			: [...ui.groups, group];
		editingGroup = false;
		groupId = undefined;
	}

	function toggleMember(id: string, checked: boolean) {
		ui.groups = ui.groups.map((group) =>
			group.id === id
				? {
						...group,
						members: checked
							? [...new Set([...group.members, personId!])]
							: group.members.filter((member) => member !== personId)
					}
				: group
		);
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
		{#if ui.friendError}<div
				class="rounded-xl bg-error-container p-3 text-sm text-on-error-container"
				role="alert"
			>
				<p>{ui.friendError}</p>
				<Button variant="text" onclick={() => ui.friendActions?.reload()}>Try again</Button>
			</div>{/if}
		{#if tab === 'people'}
			{#if activePerson}
				<Button variant="text" onclick={() => (personId = undefined)}>All people</Button>
				<h3>{activePerson.name}</h3>
				<p class="text-sm text-on-surface-variant">Full schedule</p>
				<p class="text-xs font-semibold text-primary">Groups</p>
				<ul class="preview-list p-0 list-none">
					{#each ui.groups as group (group.id)}
						<ListItem label headline={group.name}>
							{#snippet leading()}<Checkbox
									><input
										type="checkbox"
										checked={group.members.includes(activePerson.id)}
										onchange={(event) => toggleMember(group.id, event.currentTarget.checked)}
									/></Checkbox
								>{/snippet}
						</ListItem>
					{/each}
				</ul>
				<div class="gap-2 flex flex-wrap items-center">
					<Button variant="tonal" onclick={() => planWithPerson(true)}>Compare calendars</Button>
					<Button variant="text" onclick={() => planWithPerson()}>Find a time together</Button>
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
						bind:value={ui.sendFriendIdInput}
						onkeydown={(event) => {
							if (event.key === 'Enter' && !ui.actionLoadingId && ui.sendFriendIdInput.trim())
								void ui.friendActions?.send();
						}}
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
					<h3>People</h3>
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
							supporting="Full schedule"
							onclick={() => (personId = person.id)}
						/>
					{/each}
				</ul>
			{/if}
		{:else if tab === 'groups'}
			{#if editingGroup}
				<div class="gap-3 flex items-center justify-between">
					<h3>{groupId ? 'Edit group' : 'Create group'}</h3>
					<Button variant="text" onclick={() => (editingGroup = false)}>All groups</Button>
				</div>
				<div class="preview-form-stack min-w-0 gap-4 grid">
					<TextFieldOutlined label="Group name" bind:value={groupName} />
					<TextFieldOutlined label="Search members" type="search" bind:value={search} />
				</div>
				<ul class="preview-list p-0 list-none">
					{#each ui.friends.filter((person) => person.name
							.toLowerCase()
							.includes(search.toLowerCase())) as person (person.id)}
						<ListItem label headline={person.name}
							>{#snippet leading()}<Checkbox
									><input type="checkbox" bind:group={groupMembers} value={person.id} /></Checkbox
								>{/snippet}</ListItem
						>
					{/each}
				</ul>
				<p class="text-sm text-on-surface-variant">Groups stay here until you close the panel.</p>
				<div class="gap-2 flex flex-wrap">
					<Button disabled={!groupName.trim()} onclick={saveGroup}>Save group</Button>
					{#if groupId}<Button
							variant="text"
							iconType="left"
							onclick={() => {
								ui.groups = ui.groups.filter((group) => group.id !== groupId);
								editingGroup = false;
								groupId = undefined;
							}}>{@render removeIcon()}Delete group</Button
						>{/if}
				</div>
			{:else}
				<div class="gap-3 flex flex-wrap items-center justify-between">
					<h3>Private groups</h3>
					<Button variant="tonal" iconType="left" onclick={() => editGroup()}
						>{@render addIcon()}Create group</Button
					>
				</div>
				<p class="text-sm text-on-surface-variant">Groups stay here until you close the panel.</p>
				<ul class="preview-list p-0 list-none">
					{#each ui.groups as group (group.id)}
						<ListItem
							headline={group.name}
							supporting={`${group.members.length} members`}
							onclick={() => editGroup(group.id)}
						/>
					{/each}
				</ul>
			{/if}
		{:else}
			{#if ui.requestsLoading}<p class="text-sm text-on-surface-variant" role="status">
					Loading requests…
				</p>
			{:else if !requestCount}<p class="text-sm text-on-surface-variant">
					No pending requests.
				</p>{/if}
			<h3>Incoming requests</h3>
			{#each ui.incomingRequests as request (request.request_id)}
				<section class="gap-3 border-outline-variant pb-4 grid border-b">
					<h4>{request.from.name}</h4>
					<div class="gap-2 flex flex-wrap">
						<Button
							variant="tonal"
							disabled={ui.actionLoadingId !== ''}
							onclick={() => ui.friendActions?.accept(request.request_id)}>Accept</Button
						>
						<Button
							variant="text"
							disabled={ui.actionLoadingId !== ''}
							onclick={() => ui.friendActions?.decline(request.request_id)}>Decline</Button
						>
					</div>
				</section>
			{/each}
			<h3>Outgoing requests</h3>
			<ul class="preview-list p-0 list-none">
				{#each ui.outgoingRequests as request (request.request_id)}
					<ListItem headline={request.to.name} supporting="Pending">
						{#snippet trailing()}<Button
								variant="text"
								disabled={ui.actionLoadingId !== ''}
								onclick={() => ui.friendActions?.cancel(request.request_id)}>Cancel</Button
							>{/snippet}
					</ListItem>
				{/each}
			</ul>
		{/if}
	</div>
</dialog>
