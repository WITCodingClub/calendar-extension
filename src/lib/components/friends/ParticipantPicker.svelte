<script lang="ts">
	import { PEOPLE_ICON } from '$lib/icons';
	import { Button, Checkbox, ListItem, TextFieldOutlined } from 'm3-svelte';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import PreviewDialog from '$lib/components/ui/PreviewDialog.svelte';
	const ui = getPanelUi();
	let { selected = $bindable<string[]>([]) } = $props();
	let open = $state(false);
	let search = $state('');
	const friends = $derived(selected.filter((id) => id !== 'you').length);
	const summary = $derived(
		`${selected.includes('you') ? 'You' : ''}${selected.includes('you') && friends ? ' + ' : ''}${friends ? `${friends} ${friends === 1 ? 'friend' : 'friends'}` : selected.includes('you') ? '' : 'Choose participants'}`
	);

	function toggleGroup(members: string[], checked: boolean) {
		selected = checked
			? [...new Set([...selected, ...members])]
			: selected.filter((id) => !members.includes(id));
	}
</script>

<div class="min-w-0">
	<Button
		variant="outlined"
		square
		iconType="left"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d={PEOPLE_ICON} /></svg>
		<span class="text-on-surface">People: {summary}</span>
		<svg
			aria-hidden="true"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			class={['-mr-1 transition-transform', open && 'rotate-180']}
			><path fill="currentColor" d="m7 10l5 5l5-5z" /></svg
		>
	</Button>
	<PreviewDialog bind:open title="Select people">
		<div class="gap-3 grid">
			<div class="preview-fields min-w-0 grid">
				<TextFieldOutlined label="Search people" type="search" bind:value={search} />
			</div>
			{#if ui.groups.length}
				<p class="mt-3 text-xs font-semibold text-primary">Groups</p>
				<ul class="preview-list my-2 p-0 flex list-none flex-col">
					{#each ui.groups as group (group.id)}
						{@const count = group.members.filter((id) => selected.includes(id)).length}
						<ListItem
							label
							headline={group.name}
							supporting={`${count} of ${group.members.length} selected`}
						>
							{#snippet leading()}
								<span
									class="preview-group-checkbox relative inline-flex"
									class:partial={count > 0 && count < group.members.length}
								>
									<Checkbox
										><input
											type="checkbox"
											checked={group.members.length > 0 && count === group.members.length}
											disabled={!group.members.length}
											indeterminate={count > 0 && count < group.members.length}
											onchange={(event) => toggleGroup(group.members, event.currentTarget.checked)}
										/></Checkbox
									>
								</span>
							{/snippet}
						</ListItem>
					{/each}
				</ul>
			{/if}
			{#if ui.groupsLoading}<p class="text-sm text-on-surface-variant" role="status">
					Loading groups…
				</p>{/if}
			{#if ui.groupsError}
				<p class="text-sm text-error" role="alert">{ui.groupsError}</p>
				<Button
					variant="text"
					disabled={ui.groupsLoading || !!ui.groupLoadingId}
					onclick={() => ui.groupActions?.reload()}>Reload groups</Button
				>
			{/if}
			<ul class="preview-list my-1 p-0 flex list-none flex-col">
				{#each ui.people.filter((person) => person.name
						.toLowerCase()
						.includes(search.toLowerCase())) as person (person.id)}
					<ListItem
						label
						headline={person.name}
						supporting={ui.scheduleTerm && selected.includes(person.id)
							? (ui.scheduleErrors[ui.scheduleTerm]?.[person.id] ??
								(ui.scheduleStatus[ui.scheduleTerm]?.[person.id] === 'loading'
									? 'Loading schedule…'
									: person.id === 'you'
										? 'Include your own schedule'
										: person.sharing))
							: person.id === 'you'
								? 'Include your own schedule'
								: person.sharing}
					>
						{#snippet leading()}<Checkbox
								><input type="checkbox" bind:group={selected} value={person.id} /></Checkbox
							>{/snippet}
					</ListItem>
				{/each}
			</ul>
			{#if ui.friendsLoading}<p class="text-sm text-on-surface-variant" role="status">
					Loading friends…
				</p>{/if}
			{#if ui.friendError || ui.friendsError}<p class="text-sm text-error" role="alert">
					{ui.friendError || ui.friendsError}
				</p>
				<Button variant="text" onclick={() => ui.friendActions?.reload()}>Try again</Button>{/if}
			{#if ui.scheduleTerm && selected.some((id) => ui.scheduleErrors[ui.scheduleTerm!]?.[id])}
				<Button variant="text" onclick={() => ui.friendActions?.retrySchedules()}
					>Reload schedules</Button
				>
			{/if}
			<Button variant="text" onclick={() => (selected = ['you'])}>Clear friends</Button>
		</div>
	</PreviewDialog>
</div>
