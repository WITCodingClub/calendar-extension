<script lang="ts">
	import { Button, SelectOutlined, TextFieldOutlined } from 'm3-svelte';
	import { onMount } from 'svelte';
	import { API, ApiError } from '$lib/api';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { getPanelSession } from '$lib/panelSession';
	import type { MeetingLink, MeetingLinkDuration } from '$lib/types';
	import PreviewDialog from './PreviewDialog.svelte';
	import { calendarDateTime, shiftDate, todayDate } from '$lib/calendarDates';
	const ui = getPanelUi();
	const session = getPanelSession();
	let creating = $state(false);
	let title = $state('');
	let expiry = $state(shiftDate(todayDate('America/New_York'), 7));
	let startsOn = $state('');
	let endsOn = $state('');
	let duration = $state('30');
	let links = $state<MeetingLink[]>([]);
	let url = $state('');
	let generatedId = $state('');
	let copied = $state(false);
	let error = $state('');
	let formError = $state('');
	let loading = $state(false);
	let submitting = $state(false);
	let attempted = $state(false);
	let revoking = $state('');
	let version = 0;
	const durations = [15, 30, 45, 60, 90, 120];

	async function reload() {
		if (!session.active) return;
		const current = ++version;
		loading = true;
		error = '';
		try {
			const response = await API.getMeetingLinks();
			if (session.active && current === version) links = response.meeting_links;
		} catch (failure) {
			if (session.active && current === version)
				error = failure instanceof Error ? failure.message : 'Could not load meeting links.';
		} finally {
			if (session.active && current === version) loading = false;
		}
	}

	onMount(() => {
		void reload();
	});

	function openCreate() {
		title = '';
		expiry = shiftDate(todayDate('America/New_York'), 7);
		startsOn = ui.preferences.from;
		endsOn = ui.preferences.until;
		duration = durations.includes(Number(ui.preferences.duration)) ? ui.preferences.duration : '30';
		url = '';
		generatedId = '';
		copied = false;
		formError = '';
		attempted = false;
		creating = true;
	}

	async function generate() {
		if (submitting || attempted || !session.active) return;
		try {
			const today = todayDate('America/New_York');
			calendarDateTime(startsOn, '00:00');
			calendarDateTime(endsOn, '00:00');
			if (startsOn < today || endsOn < startsOn || endsOn > shiftDate(startsOn, 29))
				throw new Error('Choose a future date range of 30 days or fewer.');
			if (!durations.includes(Number(duration))) throw new Error('Choose a supported duration.');
			const expiresAt = new Date(
				Date.parse(calendarDateTime(shiftDate(expiry, 1), '00:00')) - 1
			).toISOString();
			if (Date.parse(expiresAt) <= Date.now() || Date.parse(expiresAt) > Date.now() + 60 * 86400000)
				throw new Error('Choose an expiry within the next 60 days.');
			if (title.trim().length > 200)
				throw new Error('Keep the meeting name within 200 characters.');
			submitting = true;
			attempted = true;
			formError = '';
			++version;
			loading = false;
			const response = await API.createMeetingLink({
				starts_on: startsOn,
				ends_on: endsOn,
				duration_minutes: Number(duration) as MeetingLinkDuration,
				expires_at: expiresAt,
				...(title.trim() ? { title: title.trim() } : {})
			});
			if (!session.active) return;
			const { url: createdUrl, ...link } = response.meeting_link;
			url = createdUrl;
			generatedId = link.id;
			links = [link, ...links.filter((existing) => existing.id !== link.id)];
		} catch (failure) {
			if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500)
				attempted = false;
			if (session.active)
				formError = `${failure instanceof Error ? failure.message : 'Could not generate meeting link.'}${attempted ? ' Check the link list before generating another; this request will not be repeated.' : ''}`;
		} finally {
			if (session.active) submitting = false;
		}
	}

	async function revoke(id: string) {
		if (revoking || submitting || !session.active) return;
		revoking = id;
		error = '';
		++version;
		loading = false;
		try {
			const response = await API.revokeMeetingLink(id);
			if (!session.active) return;
			links = links.map((link) => (link.id === id ? response.meeting_link : link));
			if (generatedId === id) url = '';
		} catch (failure) {
			if (session.active)
				error = failure instanceof Error ? failure.message : 'Could not revoke meeting link.';
		} finally {
			if (session.active) revoking = '';
		}
	}
</script>

<section
	class="min-w-0 gap-4 rounded-2xl border-outline-variant/65 bg-surface-container-low p-4 grid border"
	aria-labelledby="preview-links-title"
>
	<div
		class="gap-3 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-on-surface-variant flex flex-wrap items-center justify-between"
	>
		<div>
			<h3 id="preview-links-title">One-time meeting links</h3>
			<p>
				Let someone who isn't your friend, such as a professor or project partner, choose a free
				time. They don't need WIT Calendar.
			</p>
		</div>
		<Button
			variant="outlined"
			disabled={loading || submitting || Boolean(revoking)}
			onclick={openCreate}>Create meeting link</Button
		>
	</div>

	{#if loading}<p class="text-sm text-on-surface-variant" role="status">Loading links…</p>{/if}
	{#if error}<p class="text-sm text-error" role="alert">{error}</p>{/if}
	{#each links as link (link.id)}
		<div class="gap-2 border-outline-variant pb-3 grid border-b">
			<p class="text-sm font-medium">
				{link.title || 'Meeting link'} · {link.status === 'active' &&
				Date.parse(link.expires_at) <= ui.now
					? 'expired'
					: link.status}
			</p>
			<p class="text-sm text-on-surface-variant">
				{link.starts_on}–{link.ends_on} · {link.duration_minutes} min · Expires {new Date(
					link.expires_at
				).toLocaleString()}
			</p>
			{#if link.booking}<p class="text-sm">
					Booked by {link.booking.guest_name || link.booking.guest_email || 'Guest'} · {new Date(
						link.booking.start_time
					).toLocaleString()}
				</p>{/if}
			{#if link.status === 'active' && Date.parse(link.expires_at) > ui.now}<Button
					variant="text"
					disabled={Boolean(revoking) || submitting}
					onclick={() => void revoke(link.id)}>Revoke link</Button
				>{/if}
		</div>
	{/each}
	<Button
		variant="text"
		disabled={loading || Boolean(revoking) || submitting}
		onclick={() => void reload()}>Reload links</Button
	>
	<PreviewDialog
		bind:open={creating}
		closable={!submitting}
		title="Create meeting link"
		onclose={() => {
			url = '';
			generatedId = '';
			copied = false;
		}}
	>
		<div class="gap-4 grid">
			<div
				class="preview-fields min-w-0 gap-4 pt-1 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]"
			>
				<TextFieldOutlined
					label="Meeting name (optional)"
					maxlength={200}
					disabled={attempted}
					bind:value={title}
				/>
				<TextFieldOutlined
					label="Link expires"
					type="date"
					disabled={attempted}
					bind:value={expiry}
				/>
				<TextFieldOutlined label="From" type="date" disabled={attempted} bind:value={startsOn} />
				<TextFieldOutlined label="Until" type="date" disabled={attempted} bind:value={endsOn} />
				<SelectOutlined
					label="Duration"
					disabled={attempted}
					bind:value={duration}
					options={durations.map((value) => ({
						text: `${value} minutes`,
						value: String(value)
					}))}
				/>
			</div>
			<p class="text-sm text-on-surface-variant">
				Guests can book one meeting during your free periods on weekdays, 8am–9pm Eastern.
			</p>
			{#if formError}<p class="text-sm text-error" role="alert">{formError}</p>{/if}
			{#if url}
				<p class="text-sm break-all">{url}</p>
				<p class="text-sm text-on-surface-variant">
					Copy this link before closing. It cannot be retrieved again.
				</p>
				<Button
					onclick={async () => {
						try {
							await navigator.clipboard.writeText(url);
							copied = true;
						} catch {
							formError = 'Could not copy. Select and copy the link above.';
						}
					}}>{copied ? 'Copied' : 'Copy link'}</Button
				>
			{:else}<Button disabled={submitting || attempted} onclick={() => void generate()}
					>{submitting ? 'Generating…' : 'Generate link'}</Button
				>{/if}
		</div>
	</PreviewDialog>
</section>
