<script lang="ts">
	import { API } from '$lib/api';
	import outlook from '$lib/images/outlook.svg';
	import { connectOutlookCalendar, isWorkingOutlookAccount } from '$lib/outlookCalendar';
	import { track } from '$lib/telemetry';
	import type { OAuthCredential } from '$lib/types';
	import { Button, snackbar } from 'm3-svelte';

	interface Props {
		// Only the credentials with provider "microsoft".
		accounts: OAuthCredential[];
		// Reloads every credential from the backend and returns the new list.
		refreshAccounts: () => Promise<OAuthCredential[]>;
	}

	let { accounts, refreshAccounts }: Props = $props();

	let isConnecting = $state(false);
	let disconnectingId = $state<string | null>(null);

	function needsAttention(account: OAuthCredential): boolean {
		return !isWorkingOutlookAccount(account);
	}

	function statusText(account: OAuthCredential): string {
		if (account.token_revoked) return 'Access revoked — please reconnect.';
		if (account.needs_reauth) return 'Authentication expired — please reconnect.';
		if (!account.has_calendar) return 'No calendar yet — reconnect to create it.';
		return 'Syncing your classes to Outlook.';
	}

	async function connect() {
		if (isConnecting) return;
		isConnecting = true;
		try {
			// Success needs the /oauth/success page and a confirmed credential.
			// A popup that closes early is a cancel, not a success.
			const result = await connectOutlookCalendar(refreshAccounts);
			if (result.status === 'connected') {
				track('outlook_calendar_connected');
				snackbar(`Outlook calendar connected for ${result.email}`, undefined, true);
			} else if (result.status === 'cancelled') {
				snackbar('Outlook connection cancelled', undefined, true);
			} else if (result.status === 'unavailable') {
				snackbar('Outlook calendar sync is not available for your account', undefined, true);
			} else {
				snackbar(result.error, undefined, true);
			}
		} finally {
			isConnecting = false;
		}
	}

	async function disconnect(account: OAuthCredential) {
		disconnectingId = account.id;
		try {
			await API.disconnectAccount(account.id);
			snackbar('Outlook calendar disconnected', undefined, true);
		} catch (e) {
			console.error('Failed to disconnect Outlook calendar:', e);
			snackbar(
				e instanceof Error && e.message ? e.message : 'Failed to disconnect Outlook calendar',
				undefined,
				true
			);
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

<div class="gap-3 border-outline-variant p-4 flex flex-col border-t">
	<div class="gap-1 flex flex-col">
		<h2 class="m-0 text-base font-bold text-on-surface">Outlook Calendar</h2>
		<p class="m-0 text-sm text-on-surface-variant">
			Sync your classes to a calendar in your Microsoft 365 account.
		</p>
	</div>

	{#if accounts.length > 0}
		<div class="gap-2 flex flex-col">
			{#each accounts as account (account.id)}
				<div
					class={[
						'gap-3 rounded-xl bg-surface-container-lowest p-3 flex flex-row items-center justify-between @max-[30rem]:flex-col @max-[30rem]:items-stretch',
						needsAttention(account) && 'outline-error outline outline-1'
					]}
				>
					<div class="min-w-0 gap-1 flex flex-col">
						<div class="gap-2 flex flex-row items-center">
							<img src={outlook} alt="" class="h-5 w-5 shrink-0" />
							<span class="text-sm text-on-surface truncate">{account.email}</span>
						</div>
						<span
							class="ml-7 text-xs {needsAttention(account)
								? 'text-error'
								: 'text-on-surface-variant'}"
						>
							{statusText(account)}
						</span>
					</div>
					<div class="gap-2 flex shrink-0 flex-row items-center">
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
		<p class="m-0 text-xs text-on-surface-variant">
			Disconnecting stops the sync and removes your class events from Outlook.
		</p>
	{:else}
		<p class="m-0 rounded-xl bg-surface-container-lowest p-3 text-sm text-on-surface-variant">
			No Outlook calendar connected.
		</p>
		<div class="flex flex-row items-center">
			<Button variant="tonal" onclick={connect} disabled={isConnecting}>
				{isConnecting ? 'Waiting…' : 'Connect Outlook'}
			</Button>
		</div>
	{/if}
</div>
