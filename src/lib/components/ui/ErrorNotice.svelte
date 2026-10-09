<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		error = null,
		includeStatusLink = false,
		includeSelfServiceHint = false,
		children
	}: {
		title: string;
		error?: string | null;
		includeStatusLink?: boolean;
		includeSelfServiceHint?: boolean;
		children?: Snippet;
	} = $props();
</script>

<h1 class="text-3xl font-extrabold text-on-error mb-4 text-center">{title}</h1>
<p class="text-error-container mb-4 break text-center">
	{#if error}{error}{/if}
	{@render children?.()}
	{#if includeStatusLink}
		{' '}Please check the
		<a
			class="text-on-error underline"
			href="https://stats.uptimerobot.com/QS76oPqfzz"
			target="_blank">status page</a
		> for updates.
	{/if}
	{#if includeSelfServiceHint}
		{' '}Also, make sure you sign into
		<a
			href="https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory"
			target="_blank"
			class="text-on-error underline">WIT Self Service</a
		> first, then try again.
	{/if}
	{#if includeStatusLink || includeSelfServiceHint}
		{' '}If the issue persists, please submit a bug report on
		<a
			class="text-on-error underline"
			href="https://github.com/WITCodingClub/calendar-backend/issues"
			target="_blank">GitHub</a
		>.
	{/if}
</p>
