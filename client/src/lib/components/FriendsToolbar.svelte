<script lang="ts">
	import { Button, Chip } from 'm3-svelte';

	let {
		friendList,
		selectedFriends,
		primaryUser,
		ownerColorMap,
		friendsLoading,
		schedulesLoading,
		manageOpen,
		pendingRequestCount,
		ontoggleFriend,
		onsetPrimary,
		ontoggleManage
	}: {
		friendList: Array<{ id: string; name: string }>;
		selectedFriends: string[];
		primaryUser: string;
		ownerColorMap: Record<string, { lecture: string; lab: string }>;
		friendsLoading: boolean;
		schedulesLoading: boolean;
		manageOpen: boolean;
		pendingRequestCount: number;
		ontoggleFriend: (friendId: string) => void;
		onsetPrimary: (userId: string) => void;
		ontoggleManage: () => void;
	} = $props();

	const youColors = $derived(ownerColorMap['you'] ?? { lecture: '#039be5', lab: '#81d4fa' });
</script>

<div class="flex flex-col gap-2 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
	<div class="flex flex-row items-center justify-between gap-2">
		<div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Overlay</div>
		<Button variant={manageOpen ? 'tonal' : 'outlined'} square onclick={ontoggleManage}>
			{pendingRequestCount > 0
				? `Add friends (${pendingRequestCount})`
				: manageOpen
					? 'Hide'
					: 'Add friends'}
		</Button>
	</div>

	{#if friendsLoading || schedulesLoading}
		<div class="text-xs text-on-surface-variant">Loading friends...</div>
	{:else}
		<div class="flex flex-wrap gap-1.5 items-center">
			<div class="flex flex-row gap-1 items-center">
				<span class="flex flex-row gap-0.5 shrink-0">
					<span
						class="w-2.5 h-2.5 rounded-full border border-outline-variant"
						style={`background-color:${youColors.lecture}`}
					></span>
					<span
						class="w-2.5 h-2.5 rounded-full border border-outline-variant"
						style={`background-color:${youColors.lab}`}
					></span>
				</span>
				<Chip variant="input" selected={true} onclick={() => onsetPrimary('you')}>You</Chip>
				<button
					type="button"
					class="p-0.5 rounded text-on-surface-variant hover:text-primary {primaryUser === 'you'
						? 'text-primary'
						: ''}"
					aria-label="Set You as primary"
					onclick={() => onsetPrimary('you')}
				>
					<svg class="w-4 h-4" viewBox="0 0 24 24" fill={primaryUser === 'you' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
						/>
					</svg>
				</button>
			</div>

			{#if friendList.length === 0}
				<div class="text-xs text-on-surface-variant">No accepted friends yet.</div>
			{:else}
				{#each friendList as friend (friend.id)}
					{@const friendColors = ownerColorMap[friend.id] ?? youColors}
					{@const isSelected = selectedFriends.includes(friend.id)}
					{@const isPrimary = primaryUser === friend.id}
					<div class="flex flex-row gap-1 items-center">
						<span class="flex flex-row gap-0.5 shrink-0">
							<span
								class="w-2.5 h-2.5 rounded-full border border-outline-variant"
								style={`background-color:${friendColors.lecture}`}
							></span>
							<span
								class="w-2.5 h-2.5 rounded-full border border-outline-variant"
								style={`background-color:${friendColors.lab}`}
							></span>
						</span>
						<Chip variant="input" selected={isSelected} onclick={() => ontoggleFriend(friend.id)}>
							{friend.name}
						</Chip>
						{#if isSelected}
							<button
								type="button"
								class="p-0.5 rounded text-on-surface-variant hover:text-primary {isPrimary
									? 'text-primary'
									: ''}"
								aria-label={`Set ${friend.name} as primary`}
								onclick={() => onsetPrimary(friend.id)}
							>
								<svg
									class="w-4 h-4"
									viewBox="0 0 24 24"
									fill={isPrimary ? 'currentColor' : 'none'}
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
									/>
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>
