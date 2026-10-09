<script lang="ts">
	import { Button, Checkbox, ListItem, TextFieldOutlined } from 'm3-svelte';
	import { getPanelUi } from '$lib/panelUi.svelte';
	const ui = getPanelUi();
	import PreviewDialog from './PreviewDialog.svelte';
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
		<svg aria-hidden="true" viewBox="0 0 24 24"
			><path
				fill="currentColor"
				d="M1 17.2q0-.85.438-1.562T2.6 14.55q1.55-.775 3.15-1.162T9 13t3.25.388t3.15 1.162q.725.375 1.163 1.088T17 17.2v.8q0 .825-.587 1.413T15 20H3q-.825 0-1.412-.587T1 18zM18.45 20q.275-.45.413-.962T19 18v-1q0-1.1-.612-2.113T16.65 13.15q1.275.15 2.4.513t2.1.887q.9.5 1.375 1.112T23 17v1q0 .825-.587 1.413T21 20zM6.175 10.825Q5 9.65 5 8t1.175-2.825T9 4t2.825 1.175T13 8t-1.175 2.825T9 12t-2.825-1.175m11.65 0Q16.65 12 15 12q-.275 0-.7-.062t-.7-.138q.675-.8 1.038-1.775T15 8t-.362-2.025T13.6 4.2q.35-.125.7-.163T15 4q1.65 0 2.825 1.175T19 8t-1.175 2.825"
			/></svg
		>
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
