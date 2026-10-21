<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import { Button, Dialog, SelectOutlined, TextFieldOutlined } from 'm3-svelte';
	import type {
		MeetingLink,
		MeetingLinkInput,
		MeetingLinkDuration,
		MeetingLinkCreateResponse
	} from '$lib/types';
	import { onMount, onDestroy } from 'svelte';
	import {
		CAMPUS_TIME_ZONE,
		calendarDateTime,
		campusDate,
		endOfCampusDay,
		shiftDate
	} from '$lib/datetime';
	import { validDate } from '$lib/friends/schedule';
	import { REFRESH_ICON } from '$lib/icons';
	let {
		now = Date.now(),
		initialFrom = '',
		initialUntil = '',
		initialDuration = '30',
		uncertain = $bindable(false),
		onbusy,
		onload,
		oncreate,
		onrevoke,
		onmeeting
	}: {
		now?: number;
		initialFrom?: string;
		initialUntil?: string;
		initialDuration?: string;
		uncertain?: boolean;
		onbusy?: (busy: boolean) => void;

		onload: () => Promise<MeetingLink[]>;
		oncreate: (input: MeetingLinkInput) => Promise<MeetingLinkCreateResponse['meeting_link']>;
		onrevoke: (id: string) => Promise<MeetingLink>;
		onmeeting: (id: string) => void;
	} = $props();

	let creating = $state(false);
	let title = $state('');
	let expiry = $state('');
	let startsOn = $state('');
	let endsOn = $state('');
	let duration = $state('30');
	let links = $state<MeetingLink[]>([]);
	let url = $state('');
	let copied = $state(false);
	let leaving = $state(false);
	let error = $state('');
	let notice = $state('');
	let formError = $state('');
	let loading = $state(false);
	let submitting = $state(false);
	let attempted = $state(false);
	let active = true;
	onDestroy(() => {
		active = false;
		++version;
	});
	export function isBusy() {
		return busy || creating || revokeOpen;
	}
	$effect(() => onbusy?.(isBusy()));
	let reviewed = $state(false);
	let revoking = $state('');
	let revokeTarget = $state<MeetingLink | null>(null);
	let revokeOpen = $state(false);
	let revokeError = $state('');
	let version = 0;
	let visibleCount = $state(3);
	const durations = [15, 30, 45, 60, 90, 120];
	const today = $derived(campusDate(new Date(now).toISOString()));
	const busy = $derived(loading || submitting || Boolean(revoking));
	const dateOrderError = $derived(!!startsOn && !!endsOn && startsOn > endsOn);
	const maxExpiryDate = $derived.by(() => {
		const deadline = now + 60 * 86400000;
		const date = campusDate(new Date(deadline).toISOString());
		return Date.parse(endOfCampusDay(date)) <= deadline ? date : shiftDate(date, -1);
	});
	function status(link: MeetingLink) {
		if (link.booking) return 'Booked';
		if (link.status === 'used') return 'Used';
		if (link.status === 'revoked') return 'Revoked';
		if (link.status === 'expired' || Date.parse(link.expires_at) <= now) return 'Expired';
		return 'Active';
	}
	const sortedLinks = $derived.by(() => {
		const order: Record<string, number> = { Booked: 0, Active: 1, Used: 2, Expired: 3, Revoked: 4 };
		return [...links].sort(
			(a, b) =>
				order[status(a)] - order[status(b)] || Date.parse(b.created_at) - Date.parse(a.created_at)
		);
	});
	function day(value: string) {
		return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', {
			timeZone: CAMPUS_TIME_ZONE,
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
	function timestamp(value: string) {
		return new Date(value).toLocaleString('en-US', {
			timeZone: CAMPUS_TIME_ZONE,
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
	export async function reload() {
		if (submitting || revoking || loading) return;
		const current = ++version;
		visibleCount = 3;
		loading = true;
		error = '';
		try {
			const response = await onload();
			if (active && current === version) {
				links = response;
				if (uncertain) reviewed = true;
			}
		} catch (failure) {
			if (active && current === version)
				error = failure instanceof Error ? failure.message : 'Could not load meeting links.';
		} finally {
			if (active && current === version) loading = false;
		}
	}
	onMount(() => {
		void reload();
	});
	function openCreate() {
		if (busy || uncertain) return;
		title = '';
		expiry = shiftDate(today, 7);
		startsOn = validDate(initialFrom) && initialFrom >= today ? initialFrom : today;
		endsOn =
			validDate(initialUntil) && initialUntil >= startsOn
				? initialUntil > shiftDate(startsOn, 29)
					? shiftDate(startsOn, 29)
					: initialUntil
				: shiftDate(startsOn, 7);
		duration = durations.includes(Number(initialDuration)) ? initialDuration : '30';
		url = '';
		copied = false;
		leaving = false;
		formError = '';
		attempted = false;
		creating = true;
	}
	async function generate() {
		if (busy || attempted || uncertain) return;
		try {
			calendarDateTime(startsOn, '00:00');
			calendarDateTime(endsOn, '00:00');
			if (startsOn < today || endsOn < startsOn || endsOn > shiftDate(startsOn, 29))
				throw new Error('Choose dates from today onward, covering 30 days or fewer.');
			if (!durations.includes(Number(duration))) throw new Error('Choose a supported duration.');
			const expiresAt = endOfCampusDay(expiry);
			if (Date.parse(expiresAt) <= now || Date.parse(expiresAt) > now + 60 * 86400000)
				throw new Error('Choose a link expiry within the next 60 days.');
			if (title.trim().length > 200)
				throw new Error('Keep the meeting name within 200 characters.');
			submitting = true;
			attempted = true;
			formError = '';
			++version;
			const response = await oncreate({
				starts_on: startsOn,
				ends_on: endsOn,
				duration_minutes: Number(duration) as MeetingLinkDuration,
				expires_at: expiresAt,
				...(title.trim() ? { title: title.trim() } : {})
			});
			const { url: createdUrl, ...link } = response;
			if (!active) return;
			url = createdUrl;
			links = [link, ...links.filter((existing) => existing.id !== link.id)];
		} catch (failure) {
			if (!active) return;
			if (
				failure &&
				typeof failure === 'object' &&
				'status' in failure &&
				[400, 401, 403, 404, 422, 429].includes(Number(failure.status))
			)
				attempted = false;
			uncertain = attempted;
			reviewed = false;
			formError =
				(failure instanceof Error ? failure.message : 'Could not generate meeting link.') +
				(uncertain
					? ' Check the link list before generating another; this request will not be repeated.'
					: '');
		} finally {
			submitting = false;
		}
	}
	async function revoke() {
		if (busy || !revokeTarget) return;
		const id = revokeTarget.id;
		revoking = id;
		revokeError = '';
		notice = '';
		++version;
		try {
			const response = await onrevoke(id);
			if (!active) return;
			links = links.map((link) => (link.id === id ? response : link));
			revokeTarget = null;
			revokeOpen = false;
			notice = '';
		} catch (failure) {
			revokeError = failure instanceof Error ? failure.message : 'Could not revoke meeting link.';
		} finally {
			revoking = '';
		}
	}
	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			formError = '';
		} catch {
			formError = 'Could not copy automatically. Select the URL below and copy it manually.';
		}
	}
	function finish() {
		if (!copied && !leaving) {
			leaving = true;
			return;
		}
		url = '';
		creating = false;
		leaving = false;
		notice = '';
	}
</script>

<section
	class="min-w-0 gap-4 rounded-2xl border-outline-variant/65 bg-surface-container-low p-4 grid border"
	aria-labelledby="preview-links-title"
>
	<div class="row-heading">
		<h3 id="preview-links-title">One-time meeting links</h3>
		<div class="header-actions">
			<Button variant="outlined" disabled={busy || uncertain || creating} onclick={openCreate}
				>Create meeting link</Button
			>
			<Button
				variant="tonal"
				disabled={busy || creating}
				onclick={() => void reload()}
				aria-label="Refresh links"
				title="Refresh links"
			>
				<svg
					aria-hidden="true"
					width="20"
					height="20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					class:animate-spin={loading}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={REFRESH_ICON} />
				</svg>
			</Button>
		</div>
	</div>
	<div class="content">
		{#if uncertain}
			<p class="failure" role="alert">
				{formError ||
					'Creation could not be confirmed. Refresh and review the link list before starting another link.'}
			</p>
			<div class="actions">
				<Button
					variant="text"
					disabled={busy || !reviewed || !!error}
					onclick={() => {
						uncertain = false;
						attempted = false;
						notice = 'List reviewed. You may start a new link.';
					}}>I checked the list · Allow a new link</Button
				>
			</div>
		{/if}
		{#if loading}<p role="status">Loading guest links…</p>{/if}
		{#if error}<p class="failure" role="alert">
				{error} Use Refresh links to check the current state.
			</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}
		{#if !loading && !error && !links.length}<p class="muted">No meeting links yet.</p>{/if}
		{#each sortedLinks.slice(0, visibleCount) as link (link.id)}
			<article class="link-row">
				<div class="row-heading">
					<h3>{link.title || 'Guest meeting'}</h3>
					<span
						class="badge"
						class:active={status(link) === 'Active'}
						class:booked={status(link) === 'Booked'}>{status(link)}</span
					>
				</div>
				<p class="muted">
					{link.duration_minutes} minutes · {day(link.starts_on)} - {day(link.ends_on)}
				</p>
				{#if link.booking}
					<p>Booked by {link.booking.guest_name || link.booking.guest_email || 'Guest'}</p>
					<p class="muted">{timestamp(link.booking.start_time)} Eastern</p>
					<Button variant="text" disabled={busy} onclick={() => onmeeting(link.booking!.meeting_id)}
						>View meeting details</Button
					>
				{:else if status(link) === 'Active'}
					<p class="muted">Booking closes {timestamp(link.expires_at)} Eastern</p>
					<Button
						variant="text"
						disabled={busy || revokeOpen}
						onclick={() => {
							revokeTarget = link;
							revokeError = '';
							revokeOpen = true;
						}}>Revoke…</Button
					>
				{:else if status(link) === 'Expired'}<p class="muted">
						Booking closed {timestamp(link.expires_at)} Eastern
					</p>
				{:else if status(link) === 'Used'}<p class="muted">
						This link has been used. Booking details are unavailable.
					</p>
				{:else}<p class="muted">This link no longer accepts bookings.</p>{/if}
			</article>
		{/each}
		{#if sortedLinks.length > visibleCount}
			<div class="actions">
				<Button
					variant="text"
					disabled={busy}
					aria-label="Show more meeting links"
					onclick={() => (visibleCount += 3)}>Show more</Button
				>
			</div>
		{/if}
	</div>
</section>

<div class="editor-host friends-preview">
	<Dialog
		bind:open={creating}
		headline="Create meeting link"
		role="dialog"
		aria-label="Create meeting link"
		closedby={submitting || url ? 'none' : 'closerequest'}
		onclose={() => {
			if (uncertain) void reload();
		}}
	>
		{#snippet buttons()}
			<div class="editor-actions">
				{#if url}
					<Button variant="text" onclick={finish}>Done</Button>
					<Button onclick={() => void copy()}>{copied ? 'Copy again' : 'Copy guest link'}</Button>
				{:else}
					<Button
						variant="text"
						disabled={busy}
						onclick={() => {
							creating = false;
						}}>{uncertain ? 'Check link list' : 'Cancel'}</Button
					>
					<Button disabled={busy || attempted} onclick={() => void generate()}
						>{submitting ? 'Creating link…' : 'Create meeting link'}</Button
					>
				{/if}
			</div>
		{/snippet}
		<div class="editor-content">
			{#if url}
				<p role="status">Link created. Share it with your guest to book one meeting.</p>
				<TextFieldOutlined
					label="Guest booking URL"
					value={url}
					readonly
					onclick={(event) => {
						const input = event.target;
						if (input instanceof HTMLInputElement) input.select();
					}}
				/>
				<p class="muted">
					{day(startsOn)} - {day(endsOn)} · {duration} minutes<br />Booking closes {timestamp(
						endOfCampusDay(expiry)
					)} Eastern
				</p>
				{#if formError}<p class="failure" role="alert">{formError}</p>{/if}
				{#if copied}<p role="status">
						Copied to clipboard. Paste it into a message to your guest.
					</p>{/if}
			{:else}
				<p class="muted">
					Let someone outside your friends list choose a free time. They do not need WIT Calendar.
				</p>
				<p class="muted">Weekdays, 8:00 AM - 9:00 PM Eastern. One booking per link.</p>
				<TextFieldOutlined
					label="Meeting name (optional)"
					maxlength={200}
					disabled={attempted}
					bind:value={title}
				/>
				<section class="field-group" aria-label="Bookable dates">
					<h3>When can the meeting happen?</h3>
					<p class="muted">Choose a date range of up to 30 days.</p>
					<div class="fields">
						<DateField
							label="First bookable date"
							required
							min={today}
							error={dateOrderError}
							disabled={attempted}
							bind:value={startsOn}
						/>
						<DateField
							label="Last bookable date"
							required
							min={startsOn || today}
							max={validDate(startsOn) ? shiftDate(startsOn, 29) : undefined}
							error={dateOrderError}
							disabled={attempted}
							bind:value={endsOn}
						/>
					</div>
					<SelectOutlined
						label="Meeting length"
						disabled={attempted}
						bind:value={duration}
						options={durations.map((value) => ({ text: `${value} minutes`, value: String(value) }))}
					/>
				</section>

				<section class="field-group" aria-label="Booking deadline">
					<h3>When should the link stop accepting bookings?</h3>
					<DateField
						label="Link expiry date"
						required
						min={today}
						max={maxExpiryDate}
						validate={(date) => {
							const time = Date.parse(endOfCampusDay(date));
							return time > now && time <= now + 60 * 86400000;
						}}
						disabled={attempted}
						bind:value={expiry}
					/>
					<p class="muted">Booking closes at the end of this date, Eastern time.</p>
				</section>
				{#if formError}<p class="failure" role="alert">{formError}</p>{/if}
			{/if}
		</div>
	</Dialog>
</div>
<div class="confirmation-host friends-preview">
	<Dialog
		bind:open={leaving}
		headline="Leave without copying?"
		role="alertdialog"
		aria-label="Leave without copying?"
		closedby="closerequest"
	>
		{#snippet buttons()}
			<Button variant="text" onclick={() => (leaving = false)}>Keep link open</Button>
			<Button variant="outlined" onclick={finish}>Leave link</Button>
		{/snippet}
		<p>This URL cannot be shown again. If you copied it manually, you can continue.</p>
	</Dialog>
</div>
<div class="confirmation-host friends-preview">
	<Dialog
		bind:open={revokeOpen}
		headline="Revoke meeting link?"
		role="alertdialog"
		aria-label="Revoke meeting link?"
		closedby={revoking ? 'none' : 'closerequest'}
	>
		{#snippet buttons()}
			<Button
				variant="text"
				disabled={busy}
				onclick={() => {
					revokeOpen = false;
					revokeTarget = null;
				}}>Keep link</Button
			>
			<Button variant="outlined" disabled={busy} onclick={() => void revoke()}
				>{revoking ? 'Revoking…' : 'Revoke link'}</Button
			>
		{/snippet}
		<p>
			Revoke {revokeTarget?.title || 'this guest link'}? The guest will no longer be able to book
			with this link. This cannot be undone.
		</p>
		{#if revokeError}<p class="failure" role="alert">{revokeError}</p>{/if}
	</Dialog>
</div>

<style>
	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}
	.confirmation-host :global(dialog) {
		width: min(28rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: 90dvh;
	}
	.editor-host :global(dialog) {
		width: min(40rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-width: 40rem;
		max-height: 90dvh;
		overflow: hidden;
	}
	.editor-host :global(dialog > .headline),
	.editor-host :global(dialog > .buttons) {
		flex-shrink: 0;
	}
	.editor-host :global(dialog > .content) {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.editor-content {
		display: grid;
		gap: 1rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.editor-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		width: 100%;
	}

	.content,
	.field-group {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}
	h3 {
		font-weight: 600;
	}
	p {
		margin: 0;
	}
	.muted {
		color: rgb(var(--m3-scheme-on-surface-variant));
		font-size: 0.875rem;
	}
	.failure {
		color: rgb(var(--m3-scheme-error));
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		gap: 1rem;
	}
	.actions,
	.row-heading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.row-heading {
		justify-content: space-between;
	}
	.link-row {
		display: grid;
		gap: 0.4rem;
		border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
		padding-top: 1rem;
	}
	.badge {
		border: 1px solid rgb(var(--m3-scheme-outline-variant));
		border-radius: 8px;
		padding: 0.2rem 0.5rem;
		font-size: 0.8rem;
	}
	.active {
		background: rgb(var(--m3-scheme-secondary-container));
		color: rgb(var(--m3-scheme-on-secondary-container));
	}
	.booked {
		background: rgb(var(--m3-scheme-primary-container));
		color: rgb(var(--m3-scheme-on-primary-container));
	}
</style>
