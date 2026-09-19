<script lang="ts">
    import { Button } from 'm3-svelte';
    import { continueAfterSignIn } from '$lib/afterSignIn';
    import { AuthError } from '$lib/auth';
    import { setUsageStatsEnabled } from '$lib/telemetry';

    let isSaving = $state(false);

    // Call setUsageStatsEnabled before any await: Firefox shows its permission
    // prompt only while it can see the click.
    async function choose(enabled: boolean) {
        if (isSaving) {
            return;
        }
        isSaving = true;
        try {
            await setUsageStatsEnabled(enabled);
        } catch (err) {
            // A refused or failed Firefox prompt leaves the counts off.
            console.error('Usage counts choice error:', err);
        }
        try {
            await continueAfterSignIn();
        } catch (err) {
            if (!(err instanceof AuthError)) {
                throw err;
            }
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="flex flex-col items-center justify-center h-screen px-6">
    <h1 class="text-2xl font-bold text-center text-primary mb-3">Share anonymous usage counts?</h1>
    <p class="text-base text-center text-on-surface-variant mb-3 max-w-md">
        Counts such as how many schedule imports succeed show us which parts of WIT-Calendar students use, so we know what to improve.
    </p>
    <p class="text-sm text-center text-on-surface-variant mb-6 max-w-md">
        We never collect names, emails, or schedules. You can change this later in Settings.
    </p>

    <div class="flex flex-col items-center gap-2 peak w-full max-w-sm">
        <Button variant="tonal" square onclick={() => choose(true)} disabled={isSaving}>Share counts</Button>
        <Button variant="text" square onclick={() => choose(false)} disabled={isSaving}>No thanks</Button>
    </div>
</div>

<style>
    :global(.peak button) {
        height: 3rem !important;
        min-width: 280px;
    }
</style>
