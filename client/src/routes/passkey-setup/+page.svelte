<script lang="ts">
    import { onMount } from 'svelte';
    import { Button, TextFieldOutlined, snackbar } from 'm3-svelte';
    import { continueAfterSignIn, finishPasskeySetup, isPasskeySetupPending } from '$lib/afterSignIn';
    import { AuthError } from '$lib/auth';
    import { registerPasskey } from '$lib/passkeys';

    let nickname = $state('');
    let isCreating = $state(false);
    let canCreate = $derived(nickname.trim().length > 0 && !isCreating);

    onMount(async () => {
        try {
            if (!(await isPasskeySetupPending())) {
                await continueAfterSignIn();
            }
        } catch (err) {
            if (err instanceof AuthError) {
                return;
            }
            throw err;
        }
    });

    async function createPasskey() {
        const name = nickname.trim();
        if (!name || isCreating) {
            return;
        }

        isCreating = true;
        try {
            const added = await registerPasskey(name);
            if (!added) {
                return;
            }
            await finishPasskeySetup();
        } catch (err) {
            console.error('Passkey setup error:', err);
            snackbar('Could not create a passkey: ' + err, undefined, true);
        } finally {
            isCreating = false;
        }
    }

    async function skip() {
        await finishPasskeySetup();
    }
</script>

<div class="flex flex-col items-center justify-center h-screen px-6">
    <h1 class="text-2xl font-bold text-center text-primary mb-3">Create a passkey</h1>
    <p class="text-base text-center text-on-surface-variant mb-6 max-w-md">
        Add a passkey so you can sign in on this device later without going through Google again. You can skip this and add one later in Settings.
    </p>

    <div class="flex flex-col items-center gap-3 w-full max-w-sm">
        <TextFieldOutlined label="Passkey name" placeholder="This computer" bind:value={nickname} />
        <div class="flex flex-col items-center gap-2 peak w-full">
            <Button variant="tonal" square onclick={createPasskey} disabled={!canCreate}>
                {isCreating ? 'Waiting…' : 'Create passkey'}
            </Button>
            <Button variant="text" square onclick={skip} disabled={isCreating}>Not now</Button>
        </div>
    </div>
</div>

<style>
    :global(.peak button) {
        height: 3rem !important;
        min-width: 280px;
    }
</style>
