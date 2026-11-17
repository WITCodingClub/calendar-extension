<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Chip, Icon } from 'm3-svelte';
	import iconCheck from '@ktibow/iconset-material-symbols/check';
	import iconDone from '@ktibow/iconset-material-symbols/check-circle-outline';
	import iconWarning from '@ktibow/iconset-material-symbols/warning-outline';
	import iconInfo from '@ktibow/iconset-material-symbols/info-outline';
	import { prerequisiteLabel } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import { errorText } from '$lib/registration/source.svelte';
	import SectionPicker from './SectionPicker.svelte';

	let { code, fill, ondone }: { code: string; fill?: string; ondone: () => void } = $props();
	const plan = getRegistrationPlan();
	let filters = $state<string[]>([]);
	let loading = $state(false);
	let loadError = $state('');
	const option = $derived(plan.option(code));
	const suggestion = $derived(plan.suggestionFor(code));
	const added = $derived(plan.added.includes(code));
	const filterOptions = [
		{ id: 'open', label: 'Open seats' },
		{ id: 'fridays', label: 'No Fridays' },
		{ id: 'late', label: '10 AM or later' }
	];

	async function load() {
		loading = true;
		loadError = '';
		try {
			await plan.loadCourse(code);
		} catch (error) {
			loadError = errorText(error);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		if (plan.published && plan.catalog.loaded && !plan.lectures(code).length) void load();
	});
</script>

<section class="gap-2 rounded-2xl bg-surface-container p-4 flex flex-col">
	<div class="gap-2 flex items-baseline justify-between">
		<h2 class="m-0 text-base font-bold text-on-surface">{code} · {option.title}</h2>
		{#if option.credits !== null}<span class="text-sm text-on-surface-variant shrink-0"
				>{option.credits} credits</span
			>{/if}
	</div>
	{#if suggestion}<p class="m-0 text-xs font-medium text-primary">
			{suggestion.kind === 'course'
				? suggestion.reason
				: `${suggestion.label} · ${suggestion.reason}`}
		</p>{/if}
	{#if option.description}<p class="m-0 text-sm text-on-surface-variant">
			{option.description}
		</p>{/if}
	<p
		class="m-0 gap-1.5 text-sm flex items-center"
		class:text-error={option.prerequisites === 'not_met'}
	>
		<Icon
			icon={option.prerequisites === 'met'
				? iconDone
				: option.prerequisites === 'not_met'
					? iconWarning
					: iconInfo}
			size={16}
		/>{prerequisiteLabel(option)}
	</p>
	{#if option.prerequisites === 'not_met'}<p class="m-0 text-xs text-on-surface-variant">
			LeopardWeb will likely block this unless you have an override.
		</p>{/if}
	{#if option.typicallyOffered}<p class="m-0 text-xs text-on-surface-variant">
			Usually offered: {option.typicallyOffered}
		</p>{/if}
</section>
<div class="gap-2 flex flex-wrap items-center">
	<h3 class="m-0 text-base font-semibold mr-auto">Sections</h3>
	{#each filterOptions as filter (filter.id)}
		<Chip
			variant="general"
			selected={filters.includes(filter.id)}
			icon={filters.includes(filter.id) ? iconCheck : undefined}
			aria-pressed={filters.includes(filter.id)}
			onclick={() =>
				(filters = filters.includes(filter.id)
					? filters.filter((f) => f !== filter.id)
					: [...filters, filter.id])}>{filter.label}</Chip
		>
	{/each}
</div>
{#if loading}
	<p class="m-0 text-sm text-on-surface-variant" role="status">Loading sections…</p>
{:else if loadError}
	<div class="gap-2 flex flex-wrap items-center">
		<p class="m-0 text-sm text-error" role="alert">{loadError}</p>
		<Button variant="text" onclick={load}>Retry</Button>
	</div>
{:else}
	<SectionPicker {code} {filters} />
{/if}
<div class="gap-2 flex flex-wrap justify-end">
	{#if added}<Button
			variant="text"
			onclick={() => {
				plan.remove(code);
				ondone();
			}}>Remove from plan</Button
		>{/if}
	<Button
		variant="tonal"
		onclick={() => {
			if (!added || (fill && plan.fills[code] !== fill)) plan.add(code, fill);
			ondone();
		}}>{added ? 'Done' : 'Add to plan'}</Button
	>
</div>
