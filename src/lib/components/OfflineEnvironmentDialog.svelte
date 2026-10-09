<script lang="ts">
    import { onMount } from 'svelte';
    import { Button, Dialog } from 'm3-svelte';
    import { clearLocalData } from '$lib/auth';
    import { EnvironmentManager, ENVIRONMENTS, type Environment } from '$lib/environment';

    // A user on a non-prod environment whose backend went down cannot load
    // the panel, so they cannot reach the env switcher. Tell them how to get out.
    let offlineEnvironment = $state<Environment | undefined>(undefined);
    let open = $state(false);
    let checking = $state(false);

    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
    const hotkeyKeys = isMac ? ['Control', 'Shift', 'Option', 'Delete'] : ['Ctrl', 'Shift', 'Alt', 'Backspace'];

    async function check() {
        if (checking) return;
        checking = true;
        try {
            offlineEnvironment = await EnvironmentManager.getOfflineNonProdEnvironment();
            open = offlineEnvironment !== undefined;
        } catch (error) {
            console.error('Failed to check the current environment:', error);
        } finally {
            checking = false;
        }
    }

    onMount(() => {
        void check();

        // The clear-data hotkey resets the environment to prod.
        function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>) {
            if ('environment_data' in changes) void check();
        }
        chrome.storage.onChanged.addListener(onStorageChanged);
        return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    });
</script>

<Dialog headline="Environment offline" bind:open closedby="none">
    {#if offlineEnvironment}
        <div class="flex flex-col gap-3 text-on-surface-variant">
            <p class="m-0">
                The <strong class="text-on-surface">{ENVIRONMENTS[offlineEnvironment].displayName}</strong>
                server is offline. The extension cannot load until you leave this environment.
            </p>
            <p class="m-0">To clear your local data and go back to Production, press:</p>
            <p class="m-0 flex flex-wrap items-center justify-center gap-1 py-2 text-lg font-bold text-on-surface">
                {#each hotkeyKeys as key, i (key)}
                    {#if i > 0}<span class="text-on-surface-variant">+</span>{/if}
                    <kbd class="rounded-lg border border-outline bg-surface-container-high px-2 py-1 font-mono">{key}</kbd>
                {/each}
            </p>
            <p class="m-0 text-sm">You will have to sign in again after this.</p>
        </div>
    {/if}
    {#snippet buttons()}
        <Button variant="text" disabled={checking} onclick={check}>Try again</Button>
        <Button variant="filled" onclick={() => void clearLocalData()}>Clear data now</Button>
    {/snippet}
</Dialog>
