<script lang="ts">
    import { goto } from '$app/navigation';
    import { API } from '$lib/api';
    import { continueAfterSignIn } from '$lib/afterSignIn';
    import { persistSession, AuthError } from '$lib/auth';
    import { Button, LoadingIndicator, snackbar } from 'm3-svelte';
    import ErrorNotice from '$lib/components/ErrorNotice.svelte';
    import { onMount } from 'svelte';
    import { EnvironmentManager } from '$lib/environment';
    import { getWitGoogleAuthCode } from '$lib/witGoogleAuth';
    import { track } from '$lib/telemetry';

    let error = $state<string | null>(null);

    onMount(async () => {
        await EnvironmentManager.migrateOldJwtToken();
        await signIn();
    });

    async function signIn() {
        error = null;

        let auth: Awaited<ReturnType<typeof getWitGoogleAuthCode>>;
        try {
            auth = await getWitGoogleAuthCode();
        } catch (err) {
            console.error('Google auth error:', err);
            track('sign_in_google_failed');
            error = 'google_signin_failed';
            snackbar('Could not sign in with Google: ' + err, undefined, true);
            return;
        }

        try {
            const baseUrl = await API.baseUrl;
            const response = await fetch(`${baseUrl}/user/onboard`, {
                method: 'POST',
                // The backend finishes the exchange: Google wants a client_secret
                // for this client, and a published extension cannot keep one.
                body: JSON.stringify({
                    google_auth_code: auth.code,
                    code_verifier: auth.codeVerifier,
                    redirect_uri: auth.redirectUri
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // The backend refuses anything but a WIT account. Say so plainly,
            // because the fix is for the student to pick a different account
            // rather than to try again with the same one.
            if (response.status === 403) {
                const body = await response.json().catch(() => ({})) as { code?: string };
                if (body.code === 'WIT_ACCOUNT_REQUIRED') {
                    track('sign_in_wrong_account');
                    error = 'wit_account_required';
                    return;
                }
            }

            if (!response.ok) {
                const responseText = await response.text();
                console.error('Sign in error response:', responseText);
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json() as { jwt?: string; message?: string; error?: string; beta_access?: boolean };

            if (data && data.beta_access === false) {
                await chrome.storage.local.set({ beta_access: false });
                await goto('/beta-access-denied/');
                return;
            }

            if (data.jwt) {
                await persistSession(data.jwt);
            }

            track('sign_in_google_succeeded');
            await continueAfterSignIn({ offerPasskey: true });
        } catch (err) {
            if (err instanceof AuthError) {
                return;
            }
            console.error('Sign in error:', err);
            track('sign_in_google_failed');
            error = 'server_down';
            snackbar('Failed to sign in: ' + err, undefined, true);
        }
    }
</script>

<div class="flex flex-col items-center justify-center min-h-screen w-full px-4">
    <div class=" rounded-lg shadow-md p-8 flex flex-col items-center peak {error ? 'bg-error' : 'bg-surface-container-high'}">
        {#if error == 'google_signin_failed'}
            <ErrorNotice title="Google sign-in failed" error="We couldn't sign you in with Google. Please try again." />
            <Button variant="elevated" square onclick={() => signIn()}>Try Again</Button>
        {:else if error == 'wit_account_required'}
            <ErrorNotice title="Use your WIT account" error="Sign in with your @wit.edu Google account. You can connect a personal Google account for calendar sync afterwards." />
            <Button variant="elevated" square onclick={() => signIn()}>Pick a different account</Button>
        {:else if error == 'server_down'}
            <ErrorNotice title="Failed to sign in!" error="Server may be down." includeStatusLink={true} includeSelfServiceHint={false} />
            <Button variant="elevated" square onclick={() => signIn()}>Try Again</Button>
        {:else if error}
            <ErrorNotice title="Failed to sign in!" {error} includeSelfServiceHint={false} />
            <Button variant="elevated" square onclick={() => signIn()}>Try Again</Button>
        {:else}
            <h1 class="text-3xl font-extrabold text-center text-primary mb-6">Signing in!</h1>
            <LoadingIndicator size={64} />
        {/if}
    </div>
</div>

<style>
:global(.peak button) {
        height: 3rem !important;
    }

</style>
