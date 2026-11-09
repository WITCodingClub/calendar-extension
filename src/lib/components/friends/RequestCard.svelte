<script lang="ts">
	import { Button } from 'm3-svelte';
	import SelectOutlined from '$lib/components/ui/SelectOutlined.svelte';
	import { untrack } from 'svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import { CAMPUS_TIME_ZONE, campusDate, formatCampusDate, todayDate } from '$lib/datetime';
	import type { FriendIdentity, SharingLevel } from '$lib/types';
	let {
		person,
		incoming = false,
		createdAt,
		expiresAt,
		sharing = $bindable('full'),
		busy = false,
		working = false,
		pendingExpiry,
		discardVersion = 0,
		onedit,
		onaccept,
		ondecline,
		oncancel,
		onexpiry
	}: {
		person: FriendIdentity;
		incoming?: boolean;
		createdAt: string;
		expiresAt?: string | null;
		sharing?: SharingLevel;
		busy?: boolean;
		working?: boolean;
		pendingExpiry?: { date: string };
		discardVersion?: number;
		onedit?: (dirty: boolean, originalSharing: SharingLevel) => void;
		onaccept?: () => Promise<void>;
		ondecline?: () => Promise<void>;
		oncancel?: () => Promise<void>;
		onexpiry: (date: string) => Promise<boolean>;
	} = $props();
	const detailsId = $props.id();
	let expanded = $state(false);
	let initialSharing = $state<SharingLevel>();
	let lastDiscardVersion = 0;
	const currentDate = $derived(expiresAt ? campusDate(expiresAt) : '');
	let date = $derived(currentDate);
	const changed = $derived(date !== currentDate);
	const proposal = $derived(!date || (!!currentDate && date > currentDate));
	const submitLabel = $derived(
		incoming
			? changed
				? proposal
					? 'Propose & accept'
					: 'Update & accept'
				: 'Accept'
			: proposal && changed
				? 'Propose expiry'
				: 'Update expiry'
	);
	function toggleDetails() {
		if (initialSharing === undefined) initialSharing = sharing;
		expanded = !expanded;
	}
	function cancelEdit() {
		sharing = initialSharing ?? sharing;
		date = currentDate;
		expanded = false;
		initialSharing = undefined;
	}
	$effect(() => {
		const dirty =
			changed || (incoming && initialSharing !== undefined && sharing !== initialSharing);
		const originalSharing = initialSharing ?? sharing;
		untrack(() => onedit?.(dirty, originalSharing));
	});
	$effect(() => {
		if (discardVersion !== lastDiscardVersion) {
			lastDiscardVersion = discardVersion;
			untrack(cancelEdit);
		}
	});
	async function submitDetails() {
		if (changed && !(await onexpiry(date))) return;
		date = currentDate;
		if (incoming) await onaccept?.();
	}
</script>

<section
	class="request-row"
	aria-label={`${incoming ? 'Incoming' : 'Outgoing'} request: ${person.name}`}
>
	<div class="request-heading">
		<h4>{person.name}</h4>
		<span>{incoming ? 'Received' : 'Sent'} {formatCampusDate(createdAt)}</span>
	</div>
	<p class="request-summary">
		{expiresAt ? `Expires ${formatCampusDate(expiresAt)}` : 'No expiry'}
		{#if incoming}<span>
				· You share {sharing === 'full' ? 'full schedule' : 'availability only'}</span
			>{/if}
	</p>
	{#if pendingExpiry}<p class="pending">
			Expiry proposal pending: {pendingExpiry.date
				? formatCampusDate(pendingExpiry.date)
				: 'no expiry'}
		</p>{/if}
	<div class="request-actions">
		{#if incoming}
			{#if !expanded}
				<Button
					variant="tonal"
					disabled={busy}
					onclick={submitDetails}
					aria-label={`${submitLabel} friend request from ${person.name}`}
					>{working ? 'Working…' : submitLabel}</Button
				>
			{/if}
			<Button
				variant="text"
				disabled={busy}
				onclick={ondecline}
				aria-label={`Decline friend request from ${person.name}`}>Decline</Button
			>
		{:else}
			<Button variant="text" disabled={busy} onclick={oncancel}
				>{working ? 'Working…' : 'Cancel request'}</Button
			>
		{/if}
		<Button
			variant="text"
			disabled={busy}
			aria-expanded={expanded}
			aria-controls={detailsId}
			onclick={toggleDetails}>{expanded ? 'Hide details' : 'Edit details'}</Button
		>
	</div>
	{#if expanded}
		<div id={detailsId} class="request-details">
			<div class="request-fields">
				{#if incoming}
					<SelectOutlined
						label="Your sharing on acceptance"
						bind:value={sharing}
						disabled={busy}
						options={[
							{ text: 'Full schedule', value: 'full' },
							{ text: 'Availability only', value: 'availability_only' }
						]}
					/>
					<p class="field-note">
						Full schedule includes class details; availability only shows busy times.
					</p>
				{/if}
				<DateField
					label="End date (optional)"
					bind:value={date}
					min={todayDate(CAMPUS_TIME_ZONE)}
					disabled={busy}
				/>
			</div>
			{#if changed}<p class="field-note">
					{proposal
						? 'Proposal needs approval. The current expiry stays until then.'
						: 'This expiry applies immediately.'}
				</p>{/if}
			<div class="expiry-actions">
				<Button variant="text" disabled={busy} onclick={cancelEdit}>Cancel edit</Button>
				<Button
					variant="outlined"
					disabled={busy || (!incoming && !changed)}
					onclick={submitDetails}>{submitLabel}</Button
				>
			</div>
		</div>
	{/if}
</section>

<style>
	.request-row {
		min-width: 0;
		padding-block: 1rem;
		border-bottom: 1px solid rgb(var(--m3-scheme-outline-variant));
	}
	.request-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.25rem 1rem;
	}
	.request-heading h4 {
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.request-heading span,
	.request-summary,
	.field-note {
		color: rgb(var(--m3-scheme-on-surface-variant));
		font-size: 0.8125rem;
	}
	.request-summary {
		margin-block: 0.25rem 0.75rem;
	}
	.pending {
		color: rgb(var(--m3-scheme-primary));
		font-size: 0.8125rem;
		margin-bottom: 0.75rem;
	}
	.request-actions,
	.expiry-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
	}
	.request-actions :global(button:last-child) {
		margin-left: auto;
	}
	.request-details {
		display: grid;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 0.75rem;
		background: rgb(var(--m3-scheme-surface-container));
	}
	.request-fields {
		display: grid;
		min-width: 0;
		gap: 1rem;
	}
	.request-fields > :global(.m3-container),
	.request-fields :global(.date-field),
	.request-fields :global(.date-field > .m3-container) {
		width: 100%;
		min-width: 0;
	}
	.request-fields :global(input) {
		min-width: 0;
	}
	.expiry-actions {
		justify-content: flex-end;
	}
</style>
