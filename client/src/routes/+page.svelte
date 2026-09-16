<script lang="ts">
    import { Button, snackbar } from 'm3-svelte';
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

<div class="flex flex-col gap-4 justify-center items-center h-full mt-10 w-full">
    <div class="flex flex-row gap-2 mb-2">
        <h1 class="text-2xl font-bold roboto-flex-wit-main">WIT-Calendar</h1>
    </div>
    <div class="bg-surface-container-low p-4 rounded-lg shadow flex flex-col items-start w-full max-w-xl mb-2 mt-4">
        <p class="text-lg font-semibold text-on-surface mb-2">Welcome! A few things to note:</p>
        <ul class="list-disc pl-5 space-y-1 text-base text-on-surface-variant">
            <li>
                Tabs may open and close automatically when using the extension; this is normal and expected.
            </li>
            <li>
                Please make sure you're signed in here: 
                <a 
                    href="https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory" 
                    target="_blank"
                    class="text-primary underline break-all"
                >
                    https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory
                </a>
            </li>
            <li>
                You can expand the extension sidebar by dragging the left edge to see more of your calendar.
            </li>
            <li>
                Check out our website for more info and support: <a href="https://calendar.witcc.dev" target="_blank" class="text-primary underline">https://calendar.witcc.dev</a>
            </li>
        </ul>
    </div>
    <div class="flex flex-col justify-center items-center gap-3">
        <SignInWithGoogleButton onclick={signInWithGoogle} disabled={isUsingPasskey} />
        {#if canUsePasskeys}
            <div class="peak">
                <Button variant="text" square onclick={tryPasskey} disabled={isUsingPasskey}>
                    {isUsingPasskey ? 'Waiting…' : 'Sign in with a passkey'}
                </Button>
            </div>
        {/if}
    </div>
</div>

<style>
   .roboto-flex-wit-main {
        font-size: 32px;
        font-family: "Roboto Flex", sans-serif;
        color: var(--color-primary);
        font-optical-sizing: 144;
        font-weight: 900;
        line-height: 0;
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

    :global(.peak button) {
        height: 3rem !important;
        min-width: 280px;
    }
</style>
