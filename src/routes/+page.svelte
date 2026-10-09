<script lang="ts">
	import { PASSKEY_ICON } from '$lib/icons';
	import { snackbar } from 'm3-svelte';
	import { onMount } from 'svelte';
	import { AuthError, getUsableJwt } from '$lib/auth/session';
	import { continueAfterSignIn } from '$lib/auth/afterSignIn';
	import SignInWithGoogleButton from '$lib/components/ui/SignInWithGoogleButton.svelte';
	import { passkeysSupported, signInWithPasskey } from '$lib/auth/passkeys';
	import { track } from '$lib/browser/telemetry';
	import { goto } from '$app/navigation';

	let canUsePasskeys = $state(false);
	let isUsingPasskey = $state(false);

	onMount(() => {
		checkIfLoggedIn();
		passkeysSupported().then((supported) => {
			canUsePasskeys = supported;
		});
	});

	async function checkIfLoggedIn() {
		const jwt_token = await getUsableJwt();
		if (!jwt_token) {
			return;
		}
		try {
			await continueAfterSignIn();
		} catch (err) {
			if (err instanceof AuthError) {
				return;
			}
			console.error(err);
		}
	}

	function signInWithGoogle() {
		goto('/loading');
	}

	async function tryPasskey() {
		isUsingPasskey = true;
		let signedIn = false;
		try {
			if (await signInWithPasskey()) {
				signedIn = true;
				track('sign_in_passkey_succeeded');
				await continueAfterSignIn();
				return;
			}
			track('sign_in_passkey_failed');
			snackbar('Could not sign in with a passkey', undefined, true);
		} catch (err) {
			console.error('Passkey sign-in error:', err);
			// After success, the error came from the next page, not from sign-in.
			if (!signedIn) track('sign_in_passkey_failed');
			const message = err instanceof Error ? err.message : String(err);
			snackbar('Could not sign in with a passkey: ' + message, undefined, true);
		} finally {
			isUsingPasskey = false;
		}
	}
</script>

<div class="px-6 py-8 flex min-h-screen w-full flex-col items-center justify-center">
	<h1 class="roboto-flex-wit-main mb-6">WIT-Calendar</h1>

	<div
		class="mb-8 max-w-md rounded-2xl bg-surface-container p-4 w-full shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]"
	>
		<p class="mb-2 text-lg font-semibold text-on-surface">Welcome! A few things to note:</p>
		<ul class="space-y-2 pl-5 text-sm text-on-surface-variant list-disc">
			<li>
				Tabs may open and close automatically when using the extension; this is normal and expected.
			</li>
			<li>
				Please make sure you're signed in here:
				<a
					href="https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory"
					target="_blank"
					class="text-primary break-all underline"
				>
					https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory
				</a>
			</li>
			<li>
				You can expand the extension sidebar by dragging the left edge to see more of your calendar.
			</li>
			<li>
				Check out our website for more info and support:
				<a href="https://calendar.witcc.dev" target="_blank" class="text-primary underline"
					>https://calendar.witcc.dev</a
				>
			</li>
		</ul>
	</div>

	<div class="max-w-md gap-2 flex w-full flex-col">
		<SignInWithGoogleButton onclick={signInWithGoogle} disabled={isUsingPasskey} />
		{#if canUsePasskeys}
			<div class="gap-3 py-1 flex items-center">
				<span class="bg-outline-variant h-px flex-1"></span>
				<span class="text-xs text-on-surface-variant">or</span>
				<span class="bg-outline-variant h-px flex-1"></span>
			</div>
			<button
				class="h-12 gap-3 rounded-xl border-outline px-5 font-semibold text-on-surface hover:enabled:bg-surface-container-high focus-visible:outline-primary inline-flex w-full cursor-pointer items-center justify-center border bg-transparent text-[0.95rem] tracking-[0.01em] transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 hover:enabled:shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.24)] disabled:cursor-default disabled:opacity-50"
				type="button"
				onclick={tryPasskey}
				disabled={isUsingPasskey}
			>
				<svg
					class="h-5 w-5 text-primary shrink-0"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true"
				>
					<path d={PASSKEY_ICON} />
				</svg>
				<span>{isUsingPasskey ? 'Waiting…' : 'Sign in with a passkey'}</span>
			</button>
		{/if}
	</div>
</div>
