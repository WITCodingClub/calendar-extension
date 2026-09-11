<script lang="ts">
    import { goto } from '$app/navigation';
    import { API } from '$lib/api';
    import { Button, LoadingIndicator, snackbar } from 'm3-svelte';
    import ErrorNotice from '$lib/components/ErrorNotice.svelte';
    import { onMount } from 'svelte';
    import { EnvironmentManager } from '$lib/environment';
    import { createWitTab } from '$lib/witTab';
    import { getWitGoogleAccessToken } from '$lib/witGoogleAuth';
    import { passkeysSupported, signInWithPasskey } from '$lib/passkeys';

    let schoolEmail = $state('');
    let preferredName = $state('');
    let error = $state<string | null>(null);

    onMount(async () => {
        await EnvironmentManager.migrateOldJwtToken();

        // A passkey, if this device has one, skips both the LeopardWeb scrape
        // and the Google round trip. Anything short of success falls through to
        // the normal flow, so a device without a passkey notices nothing.
        if (await passkeysSupported()) {
            try {
                if (await signInWithPasskey()) {
                    goto('/onboard');
                    return;
                }
            } catch (err) {
                console.error('Passkey sign-in error:', err);
            }
        }

        fetchSchoolEmail();
    });

    function waitForComplete(tabId: number) {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                reject(new Error('Timed out waiting for WIT page to load. Are you connected to the internet?'));
            }, 15000);
            const listener = (id: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                if (id === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    clearTimeout(timeout);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    function isWitSession(url?: string) {
        return !!url?.startsWith('https://selfservice.wit.edu/') && !url.includes('/login/cas');
    }

    async function pageFetch(tabId: number, url: string): Promise<any> {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (fetchUrl: string) =>
                fetch(fetchUrl, { credentials: 'include' })
                    .then(r => r.json())
                    .catch(e => ({ error: e.message })),
            args: [url]
        });
        return results[0]?.result ?? {};
    }

    async function fetchSchoolEmail() {
        const preferredNameUrl = 'https://selfservice.wit.edu/BannerGeneralSsb/ssb/PersonalInformationDetails/getPreferredName';
        const emailsUrl = 'https://selfservice.wit.edu/BannerGeneralSsb/ssb/PersonalInformationDetails/getEmails';
        const witHtmlUrl = 'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';
        const isFirefox = navigator.userAgent.includes('Firefox');

        let tabToUse: chrome.tabs.Tab | undefined;
        let createdNewTab = false;

        try {
            error = null;

            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!isFirefox && currentTab?.url === preferredNameUrl) {
                tabToUse = currentTab;
            } else {
                tabToUse = await createWitTab(preferredNameUrl);
                createdNewTab = true;
                await waitForComplete(tabToUse.id!);
            }

            if (!tabToUse?.id) {
                throw new Error('Failed to get tab ID');
            }

            if (!isWitSession((await chrome.tabs.get(tabToUse.id)).url)) {
                error = 'not_logged_in';
                return;
            }

            if (isFirefox) {
                const loaded = waitForComplete(tabToUse.id);
                await chrome.tabs.update(tabToUse.id, { url: witHtmlUrl });
                await loaded;
                if (!isWitSession((await chrome.tabs.get(tabToUse.id)).url)) {
                    error = 'not_logged_in';
                    return;
                }
            }

            const preferredData = await pageFetch(tabToUse.id, preferredNameUrl);
            if (preferredData.preferredName) preferredName = preferredData.preferredName;
            if (preferredData.error) throw new Error(preferredData.error);

            const data = await pageFetch(tabToUse.id, emailsUrl);
            if (data.error) throw new Error(data.error);

            if (Array.isArray(data.emails)) {
                const witEmail = data.emails.find((email: any) => email?.emailType?.code === 'W');
                if (witEmail?.emailAddress) schoolEmail = witEmail.emailAddress;
            }

            if (!schoolEmail) {
                throw new Error('Could not read your WIT email. Please make sure you are signed in to LeopardWeb and try again.');
            }

            await signIn();
        } catch (err) {
            const msg = String(err);
            if (msg.includes('cas.wit.edu') || msg.includes('Cannot access contents of url') || msg.includes('NetworkError') || msg.includes('login/cas')) {
                error = 'not_logged_in';
            } else if (!error) {
                error = msg;
            }
        } finally {
            if (createdNewTab && tabToUse?.id) {
                try {
                    await chrome.tabs.remove(tabToUse.id);
                } catch {}
            }
        }
    }

    async function signIn() {
        let accessToken: string;
        try {
            accessToken = await getWitGoogleAccessToken(schoolEmail || undefined);
        } catch (err) {
            console.error('Google auth error:', err);
            error = 'google_signin_failed';
            snackbar('Could not sign in with Google: ' + err, undefined, true);
            return;
        }

        try {
            const baseUrl = await API.baseUrl;
            const response = await fetch(`${baseUrl}/user/onboard`, {
                method: 'POST',
                body: JSON.stringify({ google_access_token: accessToken, preferred_name: preferredName }),
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
                await EnvironmentManager.setJwtToken(data.jwt);
            }

            await new Promise(resolve => setTimeout(resolve, 1500));
            await goto('/onboard');
        } catch (err) {
            console.error('Sign in error:', err);
            error = 'Server is (probably) down!';
            snackbar('Failed to sign in: ' + err, undefined, true);
        }
    }
</script>

<div class="flex flex-col items-center justify-center min-h-screen w-full px-4">
    <div class=" rounded-lg shadow-md p-8 flex flex-col items-center peak {error ? 'bg-error' : 'bg-surface-container-high'}">
        {#if error == 'not_logged_in'}
            <ErrorNotice title="Not logged in to WIT!" error="Please sign in to " includeStatusLink={false} />
            <Button variant="elevated" square onclick={fetchSchoolEmail}>Try Again</Button>
        {:else if error}
            <ErrorNotice title="Failed to sign in!" error={error} includeStatusLink={true} />
            <Button variant="elevated" square onclick={fetchSchoolEmail}>Try Again</Button>
        {:else if error == 'google_signin_failed'}
            <ErrorNotice title="Google sign-in failed" error="We couldn't sign you in with Google. Please try again." includeStatusLink={false} />
            <Button variant="elevated" square onclick={() => signIn()}>Try Again</Button>
        {:else if error == 'wit_account_required'}
            <ErrorNotice title="Use your WIT account" error="Sign in with your @wit.edu Google account. You can connect a personal Google account for calendar sync afterwards." includeStatusLink={false} />
            <Button variant="elevated" square onclick={() => signIn()}>Pick a different account</Button>
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
