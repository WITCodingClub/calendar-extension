<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, Icon, snackbar } from 'm3-svelte';
	import iconOk from '@ktibow/iconset-material-symbols/check-circle-outline';
	import iconWarn from '@ktibow/iconset-material-symbols/warning-outline';
	import iconCopy from '@ktibow/iconset-material-symbols/content-copy-outline';
	import { formatTime } from '$lib/datetime';
	import { userSettings } from '$lib/stores';
	import { DAY_SHORT, meetingSummary } from '$lib/registration/builder';
	import { isLab, prerequisiteLabel } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import type { CatalogSection } from '$lib/registration/types';

	let { onback, actions }: { onback: () => void; actions?: Snippet } = $props();
	const plan = getRegistrationPlan();
	const military = $derived($userSettings?.military_time ?? true);
	const totals = $derived(plan.check?.totals);
	const blocked = $derived(
		plan.added.filter((code) => plan.option(code).prerequisites === 'not_met')
	);
	const dayRange = $derived(
		totals?.days.length ? totals.days.map((d) => DAY_SHORT[d] ?? d).join(', ') : 'None'
	);
	const rows = $derived(
		plan.added.flatMap((code) => {
			const pick = plan.picks[code];
			return [pick?.lecture, pick?.lab]
				.filter((crn): crn is string => Boolean(crn))
				.map((crn) => ({ code, crn, section: plan.section(crn) }));
		})
	);
	const stats = $derived([
		{ l: 'Days on campus', v: totals ? dayRange : '—' },
		{
			l: 'First class',
			v: totals?.earliest_start ? formatTime(totals.earliest_start, military) : '—'
		},
		{
			l: 'Last class ends',
			v: totals?.latest_end ? formatTime(totals.latest_end, military) : '—'
		},
		{
			l: 'Before 9 AM',
			v: !totals
				? '—'
				: totals.meetings_before_nine
					? `${totals.meetings_before_nine} classes`
					: 'None'
		}
	]);

	function label(section: CatalogSection | undefined) {
		if (!section) return 'Section';
		return `${isLab(section) ? 'Lab' : 'Section'} ${section.section_number}`;
	}

	function blockedText(code: string) {
		const option = plan.option(code);
		return option.missing.length
			? `${code} needs ${option.missing.join(', ')} first`
			: `${code}: ${prerequisiteLabel(option)}`;
	}

	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			snackbar(`${what} copied.`, undefined, true);
		} catch {
			snackbar("Couldn't copy. Select the text and copy it.", undefined, true);
		}
	}
</script>

{#if plan.issues.length || blocked.length}
	<section class="gap-2 rounded-2xl bg-error-container text-on-error-container p-4 flex flex-col">
		<div class="gap-2 flex items-center">
			<Icon icon={iconWarn} size={20} />
			<h2 class="m-0 text-base font-bold">Fix before registering</h2>
		</div>
		<ul class="m-0 pl-5 text-sm">
			{#each plan.issues as issue (issue.text)}<li>{issue.text}</li>{/each}
			{#each blocked as code (code)}<li>{blockedText(code)}</li>{/each}
		</ul>
		<div class="flex justify-end"><Button variant="tonal" onclick={onback}>Fix</Button></div>
	</section>
{:else if plan.checkError}
	<section
		class="gap-2 rounded-2xl bg-error-container text-on-error-container p-4 flex flex-col"
		role="alert"
	>
		<div class="gap-2 flex items-center">
			<Icon icon={iconWarn} size={20} />
			<h2 class="m-0 text-base font-bold">Couldn't check your schedule</h2>
		</div>
		<p class="m-0 text-sm">{plan.checkError}</p>
		<div class="flex justify-end">
			<Button variant="tonal" onclick={() => plan.retryCheck()}>Retry</Button>
		</div>
	</section>
{:else if plan.checking || !plan.check}
	<section class="gap-2 rounded-2xl bg-surface-container-low p-4 flex items-center" role="status">
		<p class="m-0 text-sm text-on-surface-variant">Checking your schedule…</p>
	</section>
{:else}
	<section
		class="gap-2 rounded-2xl bg-primary-container text-on-primary-container p-4 flex items-center"
	>
		<Icon icon={iconOk} size={22} />
		<div class="min-w-0">
			<h2 class="m-0 text-base font-bold">Ready to register</h2>
			<p class="m-0 text-xs">No conflicts, every lab chosen, prerequisites look met.</p>
		</div>
	</section>
{/if}

<section class="receipt rounded-2xl bg-surface-container-lowest p-4 flex flex-col">
	<div class="gap-2 pb-3 flex flex-wrap items-center justify-between">
		<div class="min-w-0">
			<h3 class="m-0 text-sm font-bold text-on-surface">{plan.termName}</h3>
			<p class="m-0 text-xs text-on-surface-variant">
				{rows.length} CRNs · {plan.credits} credits
			</p>
		</div>
		<Button
			variant="tonal"
			iconType="left"
			disabled={!rows.length}
			onclick={() => copy(plan.crns.join(', '), 'CRNs')}><Icon icon={iconCopy} />Copy all</Button
		>
	</div>
	<ul class="m-0 p-0 list-none">
		{#each rows as { code, crn, section } (crn)}
			<li class="row gap-x-3 py-2.5 grid items-start">
				<button
					type="button"
					class="crn font-mono text-base font-bold text-on-surface p-0 cursor-pointer border-0 bg-transparent text-left"
					title="Copy CRN"
					onclick={() => copy(crn, `CRN ${crn}`)}>{crn}</button
				>
				<span class="min-w-0">
					<span class="text-sm font-medium text-on-surface block"
						>{code} <span class="font-normal text-on-surface-variant">{label(section)}</span></span
					>
					{#if section}<span class="text-xs text-on-surface-variant block"
							>{meetingSummary(section, military)}</span
						>{/if}
				</span>
			</li>
		{/each}
	</ul>
	<div class="pt-3 text-sm flex justify-between">
		<span class="text-on-surface-variant">Total</span><strong>{plan.credits} credits</strong>
	</div>
</section>

<section class="gap-2 grid grid-cols-2">
	{#each stats as stat (stat.l)}
		<div class="rounded-xl bg-surface-container-low p-3">
			<p class="m-0 text-xs text-on-surface-variant">{stat.l}</p>
			<p class="m-0 text-sm font-semibold text-on-surface">{stat.v}</p>
		</div>
	{/each}
</section>
<details class="rounded-xl bg-surface-container-low px-4 py-3">
	<summary class="text-sm font-medium text-primary cursor-pointer">What this checks</summary>
	<ul class="m-0 mt-2 pl-5 text-xs text-on-surface-variant gap-1 flex flex-col">
		<li>Time conflicts and missing labs.</li>
		<li>Prerequisites, counting the courses you're taking now as passed.</li>
		<li>Open seats. Counts can be up to 30 minutes old.</li>
		<li>
			It doesn't check holds, your registration time, or course restrictions. LeopardWeb does that
			when you register.
		</li>
	</ul>
</details>

<div
	class="bottom-3 gap-2 rounded-2xl bg-surface-container-high p-3 sticky z-30 flex flex-wrap items-center justify-end shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.16)]"
>
	{#if plan.saveError}<p class="m-0 min-w-0 text-sm text-error mr-auto" role="alert">
			{plan.saveError}
		</p>{/if}
	<Button variant="text" onclick={onback}>Edit</Button>
	<Button
		variant="tonal"
		onclick={() => void plan.save()}
		disabled={Boolean(plan.savedAt) || plan.saving}
		>{plan.saving ? 'Saving…' : plan.savedAt ? 'Saved' : 'Save'}</Button
	>
	{@render actions?.()}
</div>

<style>
	.receipt {
		border: 1px dashed rgb(var(--m3-scheme-outline-variant));
	}
	.row {
		grid-template-columns: 4rem minmax(0, 1fr);
		border-bottom: 1px dashed rgb(var(--m3-scheme-outline-variant));
	}
	.row:first-child {
		border-top: 1px dashed rgb(var(--m3-scheme-outline-variant));
	}
	.crn:focus-visible {
		outline: 2px solid rgb(var(--m3-scheme-primary));
		outline-offset: 2px;
		border-radius: 0.25rem;
	}
</style>
