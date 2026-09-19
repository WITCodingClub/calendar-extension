<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from 'm3-svelte';

	let isRetrying = false;

	async function handleRetry() {
		isRetrying = true;
		await goto('/loading');
	}

</script>

<div class="flex justify-center items-center min-h-screen bg-surface p-6">
	<div class="max-w-md w-full bg-surface-container rounded-2xl p-8 shadow-lg text-center">
		<!-- Icon -->
		<div class="mb-6">
			<svg
				class="w-20 h-20 mx-auto text-error"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
				/>
			</svg>
		</div>

		<!-- Title -->
		<h1 class="text-3xl font-bold text-on-surface mb-4">Feature Access Denied</h1>

		<!-- Message -->
		<p class="text-lg text-on-surface-variant mb-3">
			You don't have access to this feature!
		</p>
		<p class="text-base text-on-surface-variant mb-6">
			Please contact support if you believe you should have access.
		</p>

		<!-- Contact Info -->
		<div class="bg-secondary-container rounded-lg p-4 mb-6">
			<p class="text-sm text-on-secondary-container mb-1 font-semibold">Contact Support (Jasper)</p>
			<a class="text-sm text-on-secondary-container " href="mailto:mayonej@wit.edu">mayonej@wit.edu</a>
		</div>

		<!-- Actions -->
		<div class="flex flex-col gap-3">
			<Button variant="filled" onclick={handleRetry} disabled={isRetrying}>
				{isRetrying ? 'Retrying...' : 'Retry'}
			</Button>
		</div>
	</div>
</div>
