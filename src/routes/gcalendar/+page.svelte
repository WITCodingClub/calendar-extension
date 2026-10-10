<script lang="ts">
	import { TextFieldOutlined, Button, snackbar } from 'm3-svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { API } from '$lib/api';
	import { AuthError, checkBetaAccess, getUsableJwt } from '$lib/auth/session';
	import { hasUsableGoogleCalendar } from '$lib/auth/afterSignIn';
	import { openOAuthWindow } from '$lib/auth/popup';
	import { track } from '$lib/browser/telemetry';

	let emailToSignInWith: string | null = $state(null);
	let emailToSubmit = $state('');

	async function checkGcalStatus() {
		try {
			if (await hasUsableGoogleCalendar()) {
				goto('/calendar');
			}
		} catch (err) {
			if (err instanceof AuthError) {
				return;
			}
			throw err;
		}
	}

	async function tryForEmail() {
		const stored = await chrome.storage.local.get('oauth_email');
		if (stored.oauth_email) {
			emailToSignInWith = stored.oauth_email;
			return;
		}
		try {
			if (typeof chrome.identity?.getProfileUserInfo !== 'function') return;
			const info = await chrome.identity.getProfileUserInfo();
			if (info?.email) emailToSignInWith = info.email;
		} catch {}
	}

	async function onStorageChanged(changes: { [key: string]: chrome.storage.StorageChange }) {
		if (changes.oauth_status?.newValue !== 'success') return;
		await chrome.storage.local.set({
			oauth_email: emailToSignInWith || emailToSubmit
		});
		// Both ways to connect set oauth_status, so count it here only.
		track('google_calendar_connected');
		goto('/calendar');
	}

	async function useDifferentEmail() {
		emailToSignInWith = null;
	}

	async function submitEmail() {
		const emailToUse = emailToSignInWith || emailToSubmit;
		try {
			// storage.onChanged does not fire when a value stays the same, so
			// clear the status from an earlier connection first.
			await chrome.storage.local.remove('oauth_status');
			const data = await API.requestOAuthForEmail(emailToUse);
			if (data.error) {
				snackbar('Failed to submit email: ' + data.error, undefined, true);
				return;
			}
			if (data.oauth_url) {
				await openOAuthWindow(data.oauth_url);
			} else {
				await chrome.storage.local.set({
					oauth_status: 'success',
					oauth_email: emailToUse
				});
				goto('/calendar');
			}
		} catch (err) {
			if (err instanceof AuthError) {
				return;
			}
			snackbar('Failed to submit email: ' + err, undefined, true);
		}
	}

	onMount(() => {
		// Listen first, so a quick connection is not missed.
		chrome.storage.onChanged.addListener(onStorageChanged);
		setup();
		return () => chrome.storage.onChanged.removeListener(onStorageChanged);
	});

	async function setup() {
		checkBetaAccess();
		if (!(await getUsableJwt())) {
			goto('/');
			return;
		}
		checkGcalStatus();
		tryForEmail();
	}
</script>

<div class="flex h-screen flex-col items-center justify-center">
	<h1 class="text-2xl font-bold text-primary mb-5 text-center">Enter your Google email</h1>
	{#if !emailToSignInWith}
		<TextFieldOutlined label="" placeholder="example@gmail.com" bind:value={emailToSubmit} />
	{/if}

	<div class="mt-3 peak gap-2 flex flex-col justify-center">
		{#if emailToSignInWith}
			<Button variant="filled" square onclick={submitEmail}
				>Continue with {emailToSignInWith}</Button
			>
			<Button variant="outlined" square onclick={useDifferentEmail}>Use a different email</Button>
		{:else}
			<Button variant="filled" square onclick={submitEmail}>Continue</Button>
		{/if}
	</div>
</div>
