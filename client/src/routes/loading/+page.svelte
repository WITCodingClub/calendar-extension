<script lang="ts">
    import { goto } from '$app/navigation';
    import { API } from '$lib/api';
    import { Button, LoadingIndicator, snackbar } from 'm3-svelte';
    import ErrorNotice from '$lib/components/ErrorNotice.svelte';
    import { onMount } from 'svelte';
    import { EnvironmentManager } from '$lib/environment';

    let schoolEmail = $state('');
    let preferredName = $state('');
    let error = $state<string | null>(null);

    onMount(async () => {
        await EnvironmentManager.migrateOldJwtToken();
        fetchSchoolEmail();
    });

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

        let tabToUse: chrome.tabs.Tab | undefined;
        let createdNewTab = false;

        try {
            error = null;

            const isFirefox = navigator.userAgent.includes('Firefox');
            const tabUrl = isFirefox ? witHtmlUrl : preferredNameUrl;
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const canReuseTab = isFirefox
                ? currentTab?.url?.startsWith('https://selfservice.wit.edu/')
                : currentTab?.url === preferredNameUrl;

            if (canReuseTab) {
                tabToUse = currentTab;
            } else {
                tabToUse = await chrome.tabs.create({ url: tabUrl });
                createdNewTab = true;

                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        reject(new Error('Timed out waiting for WIT page to load. Are you connected to the internet?'));
                    }, 15000);
                    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                        if (tabId === tabToUse!.id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
            }

            if (!tabToUse?.id) {
                throw new Error('Failed to get tab ID');
            }

            const finalTab = await chrome.tabs.get(tabToUse.id);
            if (finalTab.url && !finalTab.url.startsWith('https://selfservice.wit.edu/')) {
                error = 'not_logged_in';
                return;
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
            if (msg.includes('cas.wit.edu') || msg.includes('Cannot access contents of url')) {
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
        try {
            const baseUrl = await API.baseUrl;
            const response = await fetch(`${baseUrl}/user/onboard`, {
                method: 'POST',
                body: JSON.stringify({email: schoolEmail, preferred_name: preferredName}),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

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
