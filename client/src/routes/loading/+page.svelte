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
        // Migrate old JWT token format if needed
        await EnvironmentManager.migrateOldJwtToken();
        fetchSchoolEmail();
    });

    async function fetchSchoolEmail() {
        const preferredNameUrl = 'https://selfservice.wit.edu/BannerGeneralSsb/ssb/PersonalInformationDetails/getPreferredName';
        const emailsUrl = 'https://selfservice.wit.edu/BannerGeneralSsb/ssb/PersonalInformationDetails/getEmails';

        let tabToUse: chrome.tabs.Tab | undefined;
        let createdNewTab = false;

        try {
            error = null;

            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isOnPreferredNamePage = currentTab?.url === preferredNameUrl;

            if (isOnPreferredNamePage) {
                tabToUse = currentTab;
                createdNewTab = false;
            } else {
                tabToUse = await chrome.tabs.create({ url: preferredNameUrl });
                createdNewTab = true;

                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        reject(new Error('Timed out waiting for WIT page to load. Are you connected to the internet?'));
                    }, 15000);
                    // @ts-expect-error
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

            // Check the tab didn't redirect to a login page (expired session)
            const finalTab = await chrome.tabs.get(tabToUse.id);
            if (finalTab.url && !finalTab.url.startsWith('https://selfservice.wit.edu/')) {
                error = 'not_logged_in';
                return;
            }

            // 1) Hit preferred name endpoint first (establish cookies/session)
            const preferredRes = await chrome.scripting.executeScript({
                target: { tabId: tabToUse.id },
                world: 'MAIN',
                func: (fetchUrl: string) => {
                    return fetch(fetchUrl, { credentials: 'include' })
                        .then(r => r.json())
                        .catch(e => ({ error: e.message }));
                },
                args: [preferredNameUrl]
            });

            const preferredData = preferredRes[0]?.result ?? { preferredName: '' };
            if (preferredData.preferredName) {
                preferredName = preferredData.preferredName;
            }


            if (preferredData.error) {
                throw new Error(preferredData.error);
            }

            // 2) Hit emails endpoint in the SAME tab
            const emailRes = await chrome.scripting.executeScript({
                target: { tabId: tabToUse.id },
                world: 'MAIN',
                func: (fetchUrl: string) => {
                    return fetch(fetchUrl, { credentials: 'include' })
                        .then(r => r.json())
                        .catch(e => ({ error: e.message }));
                },
                args: [emailsUrl]
            });
            const data = emailRes[0]?.result ?? { emails: [] };
            if (data.error) {
                throw new Error(data.error);
            }

            if (Array.isArray(data.emails)) {
                const witEmail = data.emails.find((email: any) => email?.emailType?.code === 'W');
                if (witEmail?.emailAddress) {
                    schoolEmail = witEmail.emailAddress;
                }
            }

            await signIn();
        } catch (err) {
            const msg = String(err);
            if (msg.includes('cas.wit.edu') || msg.includes('Cannot access contents of url')) {
                error = 'not_logged_in';
            } else {
                error = 'Failed to fetch data! Make';
                snackbar('Failed to fetch data: ' + err, undefined, true);
            }
        } finally {
            // Always close the tab — getPreferredName is an API endpoint, never useful to leave open
            if (tabToUse?.id) {
                try {
                    await chrome.tabs.remove(tabToUse.id);
                } catch {
                    // ignore close errors
                }
            }
        }
    }

    // Obtains a Google OAuth access token for the user's Google account (their
    // personal account — the same one they sync calendars to). The backend
    // verifies this token with Google and keys the account to the verified
    // email, so the server never trusts a client-supplied email.
    async function getGoogleAccessToken(): Promise<string> {
        // getAuthToken returns a bare string on older Chrome and { token } on
        // newer MV3 builds — handle both.
        const result: unknown = await chrome.identity.getAuthToken({ interactive: true });
        const token = typeof result === 'string' ? result : (result as { token?: string } | null)?.token;
        if (!token) {
            throw new Error('Could not obtain a Google sign-in token');
        }
        return token;
    }

    async function signIn(isRetry = false) {
        let accessToken: string;
        try {
            accessToken = await getGoogleAccessToken();
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
                // wit_email is stored as metadata only — the backend keys the
                // account to the verified Google token, not this value.
                body: JSON.stringify({ google_access_token: accessToken, preferred_name: preferredName, wit_email: schoolEmail }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // A cached Google token may have expired; drop it and retry once.
            if (response.status === 401 && !isRetry) {
                await chrome.identity.removeCachedAuthToken({ token: accessToken });
                return signIn(true);
            }

            if (!response.ok) {
                const responseText = await response.text();
                console.error('Sign in error response:', responseText);
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json() as { jwt?: string; message?: string; error?: string; beta_access?: boolean };

            if (data && data.beta_access === false) {
                await chrome.storage.local.set({ beta_access: false });
                goto('/beta-access-denied/');
                return Promise.reject(new Error('Beta access denied')) as never;
            }

            if (data.jwt) {
                await EnvironmentManager.setJwtToken(data.jwt);
            }

            await new Promise(resolve => setTimeout(resolve, 1500));
            goto('/onboard');
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
            <ErrorNotice title="Not logged in to WIT!" error="Please sign in to WIT Self Service first, then try again." includeStatusLink={false} />
            <a href="https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory" target="_blank" class="text-primary underline text-sm mb-3">Open WIT Self Service</a>
            <Button variant="elevated" square onclick={fetchSchoolEmail}>Try Again</Button>
        {:else if error == 'Server is (probably) down!'}
            <ErrorNotice title="Failed to sign in!" error={error} includeStatusLink={true} />
            <Button variant="elevated" square onclick={fetchSchoolEmail}>Try Again</Button>
        {:else if error == 'Make'}
            <ErrorNotice title="Failed to fetch data!" error={error} includeStatusLink={false} />
            <Button variant="elevated" square onclick={fetchSchoolEmail}>Try Again</Button>
        {:else if error == 'google_signin_failed'}
            <ErrorNotice title="Google sign-in failed" error="We couldn't sign you in with Google. Please try again." includeStatusLink={false} />
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
