<script lang="ts">
	import { Button, Dialog } from 'm3-svelte';
	import type { MeetingLink } from '$lib/types';
	import { CAMPUS_TIME_ZONE } from '$lib/datetime';
	let {
		open = $bindable(false),
		link = null,
		error = '',
		onretry
	}: { open?: boolean; link?: MeetingLink | null; error?: string; onretry?: () => void } = $props();
	const booking = $derived(link?.booking);
	function date(value: string) {
		return new Date(value).toLocaleDateString('en-US', {
			timeZone: CAMPUS_TIME_ZONE,
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
	function time(value: string) {
		return new Date(value).toLocaleTimeString('en-US', {
			timeZone: CAMPUS_TIME_ZONE,
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="details-host friends-preview">
	<Dialog
		bind:open
		headline="Meeting details"
		role="dialog"
		aria-label="Meeting details"
		closedby="closerequest"
	>
		{#snippet buttons()}
			<Button variant="text" onclick={() => (open = false)}>Close</Button>
		{/snippet}
		{#if error}<p role="alert">{error}</p>
			{#if onretry}<Button variant="text" onclick={onretry}>Retry saved meeting</Button>{/if}{/if}
		{#if link && booking}
			<div class="details-content">
				<h3>
					{link.title ||
						(booking.guest_name ? `Meeting with ${booking.guest_name}` : 'Guest meeting')}
				</h3>
				<p>{date(booking.start_time)}</p>
				<p>{time(booking.start_time)} - {time(booking.end_time)} · Eastern time</p>
				{#if date(booking.start_time) !== date(booking.end_time)}<p>
						Ends {date(booking.end_time)}
					</p>{/if}
				<dl>
					<div>
						<dt>Length</dt>
						<dd>
							{(Date.parse(booking.end_time) - Date.parse(booking.start_time)) / 60000} minutes
						</dd>
					</div>
					<div>
						<dt>Guest</dt>
						<dd>{booking.guest_name || 'Guest'}</dd>
					</div>
					{#if booking.guest_email}<div>
							<dt>Email</dt>
							<dd>{booking.guest_email}</dd>
						</div>{/if}
				</dl>
			</div>
		{:else}
			<p role="alert">Meeting details are unavailable.</p>
		{/if}
	</Dialog>
</div>

<style>
	.details-host :global(dialog) {
		width: min(35rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: 90dvh;
		overflow: hidden;
	}
	.details-host :global(dialog > .headline),
	.details-host :global(dialog > .buttons) {
		flex-shrink: 0;
	}
	.details-host :global(dialog > .content) {
		min-height: 0;
		overflow-y: auto;
	}
	.details-content {
		display: grid;
		gap: 1rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	h3 {
		font-weight: 600;
	}
	p,
	dl,
	dd {
		margin: 0;
	}
	dl {
		display: grid;
		gap: 0.75rem;
	}
	dl > div {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr);
		gap: 1rem;
	}
	dt {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	dd {
		overflow-wrap: anywhere;
	}
</style>
