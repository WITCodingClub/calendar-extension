<script lang="ts">
    import { snackbar } from 'm3-svelte';
    import { onMount } from 'svelte';
    import { AuthError, getUsableJwt } from '$lib/auth';
    import { continueAfterSignIn } from '$lib/afterSignIn';
    import SignInWithGoogleButton from '$lib/components/SignInWithGoogleButton.svelte';
    import { passkeysSupported, signInWithPasskey } from '$lib/passkeys';
    import { track } from '$lib/telemetry';
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

<div class="flex min-h-screen w-full flex-col items-center justify-center px-6 py-8">
    <h1 class="roboto-flex-wit-main mb-6">WIT-Calendar</h1>

    <div class="mb-8 w-full max-w-md rounded-2xl bg-surface-container p-4 shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]">
        <p class="mb-2 text-lg font-semibold text-on-surface">Welcome! A few things to note:</p>
        <ul class="list-disc space-y-2 pl-5 text-sm text-on-surface-variant">
            <li>
                Tabs may open and close automatically when using the extension; this is normal and expected.
            </li>
            <li>
                Please make sure you're signed in here:
                <a
                    href="https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory"
                    target="_blank"
                    class="break-all text-primary underline"
                >
                    https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory
                </a>
            </li>
            <li>
                You can expand the extension sidebar by dragging the left edge to see more of your calendar.
            </li>
            <li>
                Check out our website for more info and support:
                <a href="https://calendar.witcc.dev" target="_blank" class="text-primary underline">https://calendar.witcc.dev</a>
            </li>
        </ul>
    </div>

    <div class="flex w-full max-w-md flex-col gap-2">
        <SignInWithGoogleButton onclick={signInWithGoogle} disabled={isUsingPasskey} />
        {#if canUsePasskeys}
            <div class="flex items-center gap-3 py-1">
                <span class="h-px flex-1 bg-outline-variant"></span>
                <span class="text-xs text-on-surface-variant">or</span>
                <span class="h-px flex-1 bg-outline-variant"></span>
            </div>
            <button
                class="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-outline bg-transparent px-5 text-[0.95rem] font-semibold tracking-[0.01em] text-on-surface transition-[background-color,box-shadow] duration-150 hover:enabled:bg-surface-container-high hover:enabled:shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.24)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-50"
                type="button"
                onclick={tryPasskey}
                disabled={isUsingPasskey}
            >
                <svg class="h-5 w-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 1a5 5 0 0 0-5 5c0 2.2 1.4 4.1 3.4 4.7L10 12v2H8v2h2v2l2 2 2-2V10.7A5 5 0 0 0 12 1zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                </svg>
                <span>{isUsingPasskey ? 'Waiting…' : 'Sign in with a passkey'}</span>
            </button>
        {/if}
    </div>
</div>

<style>
    .roboto-flex-wit-main {
        font-size: 28px;
        font-family: "Roboto Flex", sans-serif;
        color: var(--color-primary);
        font-optical-sizing: 144;
        font-weight: 900;
        line-height: 1;
        font-style: normal;
        font-variation-settings:
            "slnt" 0,
            "wdth" 129,
            "GRAD" 0,
            "XOPQ" 140,
            "XTRA" 468,
            "YOPQ" 51,
            "YTAS" 750,
            "YTDE" -203,
            "YTFI" 738,
            "YTLC" 514,
            "YTUC" 712;
    }
</style>
