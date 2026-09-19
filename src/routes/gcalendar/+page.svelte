<script lang="ts">
    import { TextFieldOutlined, Button, snackbar } from 'm3-svelte';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { onMount } from 'svelte';
    import { API } from '$lib/api';
    import { AuthError, getUsableJwt } from '$lib/auth';
    import { hasUsableGoogleCalendar } from '$lib/afterSignIn';
    import { createFeatureFlagStore, featureFlags } from '$lib/featureFlags';
    import { connectOutlookCalendar } from '$lib/outlookCalendar';
    import { track } from '$lib/telemetry';

    let emailToSignInWith: string | null = $state(null);
    let emailToSubmit = $state('');

    // The Outlook choice shows only while the microsoftGraphCalendar flag is on.
    const microsoftCalendarEnabled = createFeatureFlagStore('microsoftGraphCalendar');
    let provider = $state<'google' | 'microsoft'>('google');
    let isConnectingOutlook = $state(false);
    let useOutlook = $derived($microsoftCalendarEnabled && provider === 'microsoft');

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

    async function checkBetaAccess() {
        const beta_access = await chrome.storage.local.get('beta_access');
        if (beta_access && (beta_access.beta_access === 'false' || beta_access.beta_access === false)) {
            goto('/beta-access-denied/');
            return Promise.reject(new Error('Beta access denied')) as never;
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
        // Both flows end on /oauth/success, and the service worker sets the
        // status for either one. The Outlook flow stores its own email.
        if (provider === 'microsoft') return;
        await chrome.storage.local.set({
            oauth_email: emailToSignInWith || emailToSubmit,
        });
        // Both ways to connect set oauth_status, so count it here only.
        track('google_calendar_connected');
        goto('/calendar');
    }

    // Uses the same connect flow as the Outlook section in Settings.
    async function connectOutlook() {
        if (isConnectingOutlook) return;
        isConnectingOutlook = true;
        try {
            const result = await connectOutlookCalendar(
                async () => (await API.getConnectedAccounts()).oauth_credentials ?? []
            );
            if (result.status === 'connected') {
                await chrome.storage.local.set({ oauth_email: result.email });
                track('outlook_calendar_connected');
                goto(resolve('/calendar'));
            } else if (result.status === 'cancelled') {
                snackbar('Outlook connection cancelled', undefined, true);
            } else if (result.status === 'unavailable') {
                provider = 'google';
                snackbar('Outlook calendar sync is not available for your account', undefined, true);
            } else {
                snackbar(result.error, undefined, true);
            }
        } finally {
            isConnectingOutlook = false;
        }
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
                const screenWidth = window.screen.availWidth;
                const screenHeight = window.screen.availHeight;
                const createOptions: chrome.windows.CreateData = {
                    url: data.oauth_url,
                    width: 650,
                    height: 800,
                    left: Math.floor((screenWidth - 650) / 2),
                    top: Math.floor((screenHeight - 800) / 2),
                    type: 'popup'
                };

                try {
                    await chrome.windows.create(createOptions);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (!message.includes('Invalid value for bounds')) {
                        throw error;
                    }
                    await chrome.windows.create({
                        url: data.oauth_url,
                        width: Math.min(650, screenWidth),
                        height: Math.min(800, screenHeight),
                        type: 'popup'
                    });
                }
            } else {
                await chrome.storage.local.set({
                    oauth_status: 'success',
                    oauth_email: emailToUse,
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
        // A failed load leaves every flag off, so the page stays Google only.
        featureFlags.loadFlags();
    }
</script>

<div class="flex flex-col items-center justify-center h-screen">

    {#if $microsoftCalendarEnabled}
        <div class="flex flex-row gap-2 mb-5 peak">
            <Button variant={provider === 'google' ? 'filled' : 'outlined'} square onclick={() => (provider = 'google')}>Google Calendar</Button>
            <Button variant={provider === 'microsoft' ? 'filled' : 'outlined'} square onclick={() => (provider = 'microsoft')}>Outlook</Button>
        </div>
    {/if}

    {#if useOutlook}
        <h1 class="text-2xl font-bold text-center text-primary mb-2">Connect your Outlook calendar</h1>
        <p class="text-sm text-on-surface-variant text-center max-w-xs">Sign in with your WIT Microsoft account. We add a WIT Courses calendar to Outlook.</p>
        <div class="flex justify-center mt-3 peak flex-col gap-2">
            <Button variant="filled" square onclick={connectOutlook} disabled={isConnectingOutlook}>
                {isConnectingOutlook ? 'Waiting…' : 'Continue with Outlook'}
            </Button>
        </div>
    {:else}
        <h1 class="text-2xl font-bold text-center text-primary mb-5">Enter your Google email</h1>
        {#if !emailToSignInWith}
            <TextFieldOutlined label="" placeholder="example@gmail.com" bind:value={emailToSubmit} />
        {/if}

        <div class="flex justify-center mt-3 peak flex-col gap-2">
            {#if emailToSignInWith}
                <Button variant="filled" square onclick={submitEmail}>Continue with {emailToSignInWith}</Button>
                <Button variant="outlined" square onclick={useDifferentEmail}>Use a different email</Button>
            {:else}
                <Button variant="filled" square onclick={submitEmail}>Continue</Button>
            {/if}
        </div>
    {/if}
</div>

<style>
    :global(.peak button) {
        height: 2.5rem !important;
    }
</style>