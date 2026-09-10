<script lang="ts">
    import { TextFieldOutlined, Button } from 'm3-svelte';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import { API } from '$lib/api';
    import { snackbar } from 'm3-svelte';

    let jwt_token: string | undefined = $state(undefined);
    let emailToSignInWith: string | null = $state(null);
    let emailToSubmit = $state('');

    async function checkGcalStatus() {
        const oauth_email = await chrome.storage.local.get('oauth_email');
        if (oauth_email.oauth_email !== undefined && oauth_email.oauth_email !== '') {
            goto('/calendar');
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
        const info = await chrome.identity.getProfileUserInfo();
        if (info && info.email) {
            emailToSignInWith = info.email;
        }
    }

    async function setupListener() {
        chrome.storage.onChanged.addListener((changes: any) => {
            //@ts-expect-error
            Object.entries(changes).forEach(async ([key, { newValue }]) => {
                if (key === 'oauth_status' && newValue === 'success') {
                    await chrome.storage.local.set({
                        oauth_email: emailToSignInWith || emailToSubmit,
                    });
                    goto('/calendar');
                }
            });
        });
    }

    async function useDifferentEmail() {
        emailToSignInWith = null;
    }

    async function submitEmail() {
        const emailToUse = emailToSignInWith || emailToSubmit;
        const baseUrl = await API.baseUrl;

        const response = await fetch(`${baseUrl}/user/gcal`, {
            method: 'POST',
            body: JSON.stringify({email: emailToUse}),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt_token}`
            }
        });
        const data = await response.json();
        if (response.ok && data.oauth_url) {
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
        } else if (response.ok && !data.oauth_url) {
            await chrome.storage.local.set({
                    oauth_status: 'success',
            });
            await chrome.storage.local.set({
                oauth_email: emailToSignInWith || emailToSubmit,
            });
            goto('/calendar');
        } else {
            snackbar('Failed to submit email: ' + data.error, undefined, true);
        }
    }

    onMount(async () => {
        checkBetaAccess();
        jwt_token = await API.getJwtToken();
        if (!jwt_token) {
            // No JWT token for current environment, redirect to welcome page
            goto('/');
            return;
        }
        checkGcalStatus();
        tryForEmail();
        setupListener();
    });
</script>

<div class="flex flex-col items-center justify-center h-screen">

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
</div>

<style>
    :global(.peak button) {
        height: 2.5rem !important;
    }
</style>