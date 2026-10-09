<script lang="ts">
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

<div class="px-6 py-8 flex min-h-screen w-full flex-col items-center justify-center">
	<h1 class="roboto-flex-wit-main mb-6">WIT-Calendar</h1>

	<div
		class="mb-8 max-w-md rounded-2xl bg-surface-container p-4 w-full shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]"
	>
		<p class="mb-2 text-lg font-semibold text-on-surface">Share anonymous usage counts?</p>
		<p class="mb-2 text-sm text-on-surface-variant">
			Counts such as how many schedule imports succeed show us which parts of WIT-Calendar students
			use, so we know what to improve.
		</p>
		<p class="m-0 text-sm text-on-surface-variant">
			We never collect names, emails, or schedules. You can change this later in Settings.
		</p>
	</div>

	<div class="max-w-md gap-2 flex w-full flex-col">
		<button
			class="h-12 rounded-xl border-outline bg-primary-container px-5 font-semibold text-on-primary-container focus-visible:outline-primary inline-flex w-full cursor-pointer items-center justify-center border text-[0.95rem] tracking-[0.01em] transition-[filter,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 hover:enabled:shadow-[0_1px_2px_rgb(var(--m3-scheme-shadow)/0.16)] hover:enabled:brightness-110 disabled:cursor-default disabled:opacity-50"
			type="button"
			onclick={() => choose(true)}
			disabled={isSaving}
		>
			Share counts
		</button>
		<div class="gap-3 py-1 flex items-center">
			<span class="bg-outline-variant h-px flex-1"></span>
			<span class="text-xs text-on-surface-variant">or</span>
			<span class="bg-outline-variant h-px flex-1"></span>
		</div>
		<button
			class="h-12 rounded-xl border-outline px-5 font-semibold text-on-surface hover:enabled:bg-surface-container-high focus-visible:outline-primary inline-flex w-full cursor-pointer items-center justify-center border bg-transparent text-[0.95rem] tracking-[0.01em] transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 hover:enabled:shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.24)] disabled:cursor-default disabled:opacity-50"
			type="button"
			onclick={() => choose(false)}
			disabled={isSaving}
		>
			No thanks
		</button>
	</div>
</div>

<style>
	.roboto-flex-wit-main {
		font-size: 28px;
		font-family: 'Roboto Flex', sans-serif;
		color: var(--color-primary);
		font-optical-sizing: 144;
		font-weight: 900;
		line-height: 1;
		font-style: normal;
		font-variation-settings:
			'slnt' 0,
			'wdth' 129,
			'GRAD' 0,
			'XOPQ' 140,
			'XTRA' 468,
			'YOPQ' 51,
			'YTAS' 750,
			'YTDE' -203,
			'YTFI' 738,
			'YTLC' 514,
			'YTUC' 712;
	}
</style>
