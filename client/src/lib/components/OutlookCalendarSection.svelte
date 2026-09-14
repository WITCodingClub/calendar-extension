<script lang="ts">
	import { API, ApiRequestError } from '$lib/api';
	import { featureFlags } from '$lib/featureFlags';
	import outlook from '$lib/images/outlook.svg';
	import type { OAuthCredential } from '$lib/types';
	import { Button, snackbar } from 'm3-svelte';
	import { onDestroy } from 'svelte';

	interface Props {
		// Only the credentials with provider "microsoft".
		accounts: OAuthCredential[];
		// Reloads every credential from the backend and returns the new list.
		refreshAccounts: () => Promise<OAuthCredential[]>;
	}

	let { accounts, refreshAccounts }: Props = $props();

	const POPUP_POLL_MS = 500;

	let isConnecting = $state(false);
	let disconnectingId = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | undefined;

	onDestroy(() => {
		if (pollTimer !== undefined) clearInterval(pollTimer);
	});

	function needsAttention(account: OAuthCredential): boolean {
		return account.needs_reauth || !account.has_calendar;
	}

	function statusText(account: OAuthCredential): string {
		if (account.token_revoked) return 'Access revoked. Reconnect to keep syncing.';
		if (account.needs_reauth) return 'Sign-in expired. Reconnect to keep syncing.';
		if (!account.has_calendar) return 'No calendar yet. Reconnect to create it.';
		return 'Syncing to the WIT Courses calendar';
	}

	async function connect() {
		if (isConnecting) return;
		isConnecting = true;

		let oauthUrl: string;
		try {
			oauthUrl = (await API.requestMicrosoftCalendarOAuth()).oauth_url;
		} catch (e) {
			isConnecting = false;
			if (e instanceof ApiRequestError && e.status === 404) {
				// The flag went off after the flags loaded. Reload them to hide this section.
				snackbar('Outlook calendar sync is not available for your account', undefined, true);
				await featureFlags.reload();
				return;
			}
			console.error('Failed to start the Outlook calendar connection:', e);
			snackbar('Failed to connect Outlook calendar', undefined, true);
			return;
		}

		// Same flow as the Google popup: the backend ends on /oauth/success or
		// /oauth/failure, and the window closes. Then reload the credentials.
		const popup = window.open(oauthUrl, 'Microsoft OAuth', 'width=500,height=600');
		if (!popup) {
			isConnecting = false;
			snackbar('Allow pop-ups to connect Outlook calendar', undefined, true);
			return;
		}

		pollTimer = setInterval(async () => {
			if (!popup.closed) return;
			clearInterval(pollTimer);
			pollTimer = undefined;
			try {
				const updated = await refreshAccounts();
				const connected = updated.some(
					(a) => a.provider === 'microsoft' && a.has_calendar && !a.needs_reauth
				);
				snackbar(
					connected ? 'Outlook calendar connected!' : 'Outlook calendar was not connected',
					undefined,
					true
				);
			} catch (e) {
				console.error('Failed to refresh accounts:', e);
			} finally {
				isConnecting = false;
			}
		}, POPUP_POLL_MS);
	}

	async function disconnect(account: OAuthCredential) {
		disconnectingId = account.id;
		try {
			await API.disconnectAccount(account.id);
			snackbar('Outlook calendar disconnected', undefined, true);
		} catch (e) {
			console.error('Failed to disconnect Outlook calendar:', e);
			snackbar('Failed to disconnect Outlook calendar', undefined, true);
			return;
		} finally {
			disconnectingId = null;
		}

		try {
			await refreshAccounts();
		} catch (e) {
			console.error('Failed to refresh accounts:', e);
		}
	}
</script>

<div class="mt-4 gap-3 border-outline-variant pt-4 flex flex-col border-t">
	<div class="gap-1 flex flex-col">
		<h2 class="text-md font-bold">Outlook Calendar</h2>
		<p class="text-sm text-outline">
			Sync your classes to a calendar in your Microsoft 365 account
		</p>
	</div>

	{#if accounts.length > 0}
		<div class="gap-2 flex flex-col">
			{#each accounts as account (account.id)}
				<div
					class="gap-3 rounded-lg bg-surface-container-low p-3 flex flex-row items-center justify-between {needsAttention(
						account
					)
						? 'border-error border'
						: ''}"
				>
					<div class="min-w-0 gap-1 flex flex-col">
						<div class="gap-2 flex flex-row items-center">
							<img src={outlook} alt="" class="h-5 w-5 shrink-0" />
							<span class="text-sm truncate">{account.email}</span>
						</div>
						<span class="ml-7 text-xs {needsAttention(account) ? 'text-error' : 'text-outline'}">
							{statusText(account)}
						</span>
					</div>
					<div class="gap-2 flex flex-row items-center">
						{#if needsAttention(account)}
							<Button variant="tonal" onclick={connect} disabled={isConnecting}>Reconnect</Button>
						{/if}
						<Button
							variant="text"
							onclick={() => disconnect(account)}
							disabled={disconnectingId === account.id}
							title="Disconnect Outlook calendar"
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path
									d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
								/>
							</svg>
						</Button>
					</div>
				</div>
			{/each}
		</div>
		<p class="text-xs text-outline">
			Disconnecting stops the sync. The WIT Courses calendar stays in Outlook. You can delete it
			there.
		</p>
	{:else}
		<p class="text-sm text-outline-variant italic">No Outlook calendar connected</p>
		<div class="flex flex-row items-center">
			<Button variant="tonal" onclick={connect} disabled={isConnecting}>
				{isConnecting ? 'Waiting…' : 'Connect Outlook'}
			</Button>
		</div>
	{/if}
</div>
