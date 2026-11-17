<script lang="ts">
	import type { FinderItem } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';

	const plan = getRegistrationPlan();
	const required = $derived(plan.finderItems.filter((item) => item.required));
	const extras = $derived(plan.finderItems.filter((item) => !item.required));

	function toggle(itemId: string) {
		plan.finderIncluded = plan.finderIncluded.includes(itemId)
			? plan.finderIncluded.filter((entry) => entry !== itemId)
			: [...plan.finderIncluded, itemId];
		plan.finderResult = null;
	}
</script>

{#snippet item(entry: FinderItem)}
	<label
		class="gap-3 py-1.5 flex items-start"
		class:cursor-pointer={!entry.blocked}
		class:opacity-60={entry.blocked}
	>
		<input
			type="checkbox"
			class="mt-0.5 accent-primary h-4 w-4 shrink-0"
			disabled={Boolean(entry.blocked)}
			checked={plan.finderIncluded.includes(entry.id)}
			onchange={() => toggle(entry.id)}
		/>
		<span class="min-w-0 flex-1">
			<span class="text-sm text-on-surface block">{entry.label}</span>
			<span
				class="text-xs block"
				class:text-error={entry.blocked}
				class:text-on-surface-variant={!entry.blocked}>{entry.blocked ?? entry.detail}</span
			>
		</span>
	</label>
{/snippet}

<div class="gap-1 flex flex-col">
	<h3 class="m-0 text-sm font-semibold">Planned for {plan.termName}</h3>
	{#each required as entry (entry.id)}{@render item(entry)}{:else}
		<p class="m-0 text-xs text-on-surface-variant">
			Your degree plan has nothing recommended for {plan.termName}.
		</p>
	{/each}
	{#if extras.length}
		<h3 class="m-0 mt-2 text-sm font-semibold">Catch up</h3>
		<p class="m-0 text-xs text-on-surface-variant">
			From an earlier term in your plan. Off by default, since adding them can make this term heavy.
		</p>
		{#each extras as entry (entry.id)}{@render item(entry)}{/each}
	{/if}
</div>

<style>
	label:has(input:focus-visible) {
		outline: 2px solid rgb(var(--m3-scheme-primary));
		outline-offset: 2px;
		border-radius: 0.5rem;
	}
</style>
