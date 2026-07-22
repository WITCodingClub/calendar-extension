<script lang="ts">
	import { Button, TextFieldOutlined } from 'm3-svelte';

	let {
		sendFriendIdInput = $bindable(''),
		incomingRequests,
		outgoingRequests,
		friendList,
		requestsLoading,
		actionLoadingId,
		onsendRequest,
		onacceptRequest,
		ondeclineRequest,
		oncancelRequest,
		onunfriend
	}: {
		sendFriendIdInput?: string;
		incomingRequests: Array<{ request_id: string; from: { id: string; name: string } }>;
		outgoingRequests: Array<{ request_id: string; to: { id: string; name: string } }>;
		friendList: Array<{ id: string; name: string }>;
		requestsLoading: boolean;
		actionLoadingId: string;
		onsendRequest: () => void;
		onacceptRequest: (requestId: string) => void;
		ondeclineRequest: (requestId: string) => void;
		oncancelRequest: (requestId: string) => void;
		onunfriend: (friendId: string) => void;
	} = $props();
</script>

<div class="flex flex-col gap-2.5 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
	<div class="flex flex-col gap-2">
		<div class="flex flex-col gap-0.5">
			<div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Send friend request</div>
			<div class="text-[11px] text-on-surface-variant">Use their email or user ID</div>
		</div>
		<div class="flex flex-row gap-2 items-center flex-wrap">
			<div class="flex-1 min-w-[8rem]">
				<TextFieldOutlined
					label="Email or user ID"
					bind:value={sendFriendIdInput}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							onsendRequest();
						}
					}}
				/>
			</div>
			<Button
				variant="filled"
				square
				disabled={actionLoadingId === 'send-request' || !sendFriendIdInput.trim()}
				onclick={onsendRequest}
			>
				Send
			</Button>
		</div>
	</div>

	{#if requestsLoading || incomingRequests.length > 0 || outgoingRequests.length > 0}
		<div class="h-px bg-outline-variant"></div>
		<div class="flex flex-col gap-1.5">
			<div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Requests</div>
			{#if requestsLoading}
				<div class="text-xs text-on-surface-variant">Loading requests...</div>
			{:else}
				<div class="flex flex-col gap-1.5">
					{#if incomingRequests.length > 0}
						<div class="flex flex-col gap-1">
							<div class="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
								Incoming
							</div>
							{#each incomingRequests as req (req.request_id)}
								<div
									class="flex flex-row items-center justify-between gap-2 bg-surface-container-lowest rounded-md px-2 py-1.5 border border-outline-variant"
								>
									<div class="text-sm truncate">{req.from.name} ({req.from.id})</div>
									<div class="flex flex-row gap-1 shrink-0">
										<Button
											variant="filled"
											square
											disabled={actionLoadingId !== '' && actionLoadingId !== `accept-${req.request_id}`}
											onclick={() => onacceptRequest(req.request_id)}
										>
											Accept
										</Button>
										<Button
											variant="outlined"
											square
											disabled={actionLoadingId !== '' && actionLoadingId !== `decline-${req.request_id}`}
											onclick={() => ondeclineRequest(req.request_id)}
										>
											<span class="text-error">Decline</span>
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					{#if outgoingRequests.length > 0}
						<div class="flex flex-col gap-1">
							<div class="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
								Outgoing
							</div>
							{#each outgoingRequests as req (req.request_id)}
								<div
									class="flex flex-row items-center justify-between gap-2 bg-surface-container-lowest rounded-md px-2 py-1.5 border border-outline-variant"
								>
									<div class="text-sm truncate">{req.to.name} ({req.to.id})</div>
									<Button
										variant="outlined"
										square
										disabled={actionLoadingId !== '' && actionLoadingId !== `cancel-${req.request_id}`}
										onclick={() => oncancelRequest(req.request_id)}
									>
										<span class="text-error">Cancel</span>
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if friendList.length > 0}
		<div class="h-px bg-outline-variant"></div>
		<div class="flex flex-col gap-1.5">
			<div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Remove friends</div>
			{#each friendList as friend (friend.id)}
				<div
					class="flex flex-row items-center justify-between gap-2 bg-surface-container-lowest rounded-md px-2 py-1.5 border border-outline-variant"
				>
					<div class="text-sm truncate">{friend.name}</div>
					<Button
						variant="outlined"
						square
						disabled={actionLoadingId !== '' && actionLoadingId !== `unfriend-${friend.id}`}
						onclick={() => onunfriend(friend.id)}
					>
						<span class="text-error">Remove</span>
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</div>
