<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, Icon, TextFieldOutlined } from 'm3-svelte';
	import iconBack from '@ktibow/iconset-material-symbols/arrow-back-rounded';
	import iconChevron from '@ktibow/iconset-material-symbols/chevron-right-rounded';
	import iconDone from '@ktibow/iconset-material-symbols/check-circle-outline';
	import iconWarning from '@ktibow/iconset-material-symbols/warning-outline';
	import iconInfo from '@ktibow/iconset-material-symbols/info-outline';
	import { userSettings } from '$lib/stores';
	import { meetingSummary } from '$lib/registration/builder';
	import { prerequisiteLabel } from '$lib/registration/options';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import { errorText } from '$lib/registration/source.svelte';
	import CourseDetail from './CourseDetail.svelte';
	import PlanBar from './PlanBar.svelte';

	type Page =
		| { name: 'list' }
		| { name: 'course'; code: string; fill?: string }
		| { name: 'slot'; id: string }
		| { name: 'search' };

	let { top, onschedule }: { top?: Snippet; onschedule: () => void } = $props();
	const plan = getRegistrationPlan();
	const military = $derived($userSettings?.military_time ?? true);
	let page = $state<Page>({ name: 'list' });
	let search = $state('');
	let searchResults = $state<{ code: string; title: string }[]>([]);
	let searching = $state(false);
	let searchError = $state('');
	let searchAttempt = $state(0);
	let searchVersion = 0;
	const open = $derived(
		plan.suggestions.filter((s) => !s.options.some((option) => plan.added.includes(option.code)))
	);
	const card =
		'rounded-2xl bg-surface-container-low overflow-hidden shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.1)]';

	$effect(() => {
		const query = search.trim();
		const version = ++searchVersion;
		void searchAttempt;
		searchError = '';
		if (page.name !== 'search' || query.length < 2) {
			searchResults = [];
			searching = false;
			return;
		}
		searching = true;
		const timer = setTimeout(async () => {
			try {
				const found = await plan.searchCourses(query);
				if (version === searchVersion) searchResults = found;
			} catch (error) {
				if (version === searchVersion) searchError = errorText(error);
			} finally {
				if (version === searchVersion) searching = false;
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	function go(next: Page) {
		page = next;
		window.scrollTo({ top: 0 });
	}

	function status(code: string) {
		const issue = plan.issues.find((entry) => entry.code === code);
		const lecture = plan.picks[code]?.lecture ? plan.section(plan.picks[code].lecture!) : undefined;
		return { issue: issue?.text, lecture };
	}
</script>

{#snippet back()}
	<div class="-ml-2">
		<Button variant="text" iconType="left" onclick={() => go({ name: 'list' })}
			><Icon icon={iconBack} />Courses</Button
		>
	</div>
{/snippet}

{#snippet row(title: string, detail: string, tone: 'error' | 'ok' | 'muted', onclick: () => void)}
	<button
		type="button"
		class="gap-3 px-4 py-3 hover:bg-on-surface/5 focus-visible:outline-primary flex w-full cursor-pointer items-center border-0 bg-transparent text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
		{onclick}
	>
		<span
			class="shrink-0"
			class:text-error={tone === 'error'}
			class:text-primary={tone === 'ok'}
			class:text-on-surface-variant={tone === 'muted'}
			><Icon
				icon={tone === 'error' ? iconWarning : tone === 'ok' ? iconDone : iconInfo}
				size={20}
			/></span
		>
		<span class="min-w-0 flex-1">
			<span class="text-sm font-semibold text-on-surface block">{title}</span>
			<span
				class="text-xs block"
				class:text-error={tone === 'error'}
				class:text-on-surface-variant={tone !== 'error'}>{detail}</span
			>
		</span>
		<span class="text-on-surface-variant"><Icon icon={iconChevron} size={20} /></span>
	</button>
{/snippet}

{#if page.name === 'course'}
	{@render back()}
	{#key page.code}
		<CourseDetail code={page.code} fill={page.fill} ondone={() => go({ name: 'list' })} />
	{/key}
{:else if page.name === 'slot'}
	{@const id = page.id}
	{@const suggestion = plan.suggestions.find((entry) => entry.id === id)}
	{@render back()}
	{#if suggestion}
		<section class="gap-1 px-1 flex flex-col">
			<h2 class="m-0 text-base font-bold text-on-surface">{suggestion.label}</h2>
			<p class="m-0 text-sm text-on-surface-variant">
				{suggestion.kind === 'choice'
					? 'Your degree plan lets you take either one.'
					: `Courses in ${plan.termName} that count for this slot.`}
			</p>
		</section>
		<section class={card}>
			<div class="divide-outline-variant bg-surface-container divide-y">
				{#each suggestion.options as option (option.code)}
					{@render row(
						`${option.code} · ${option.title}`,
						option.offered === false
							? `Not offered in ${plan.termName}`
							: [
									option.hssCategory,
									prerequisiteLabel(option),
									option.openSeats === false ? 'Full' : null
								]
									.filter(Boolean)
									.join(' · '),
						option.offered === false || option.prerequisites === 'not_met' ? 'error' : 'muted',
						() => go({ name: 'course', code: option.code, fill: suggestion.id })
					)}
				{:else}
					<p class="m-0 p-4 text-sm text-on-surface-variant">
						{plan.published
							? `No matching courses in ${plan.termName}.`
							: `Sections for ${plan.termName} aren't posted yet.`}
					</p>
				{/each}
			</div>
		</section>
	{/if}
{:else if page.name === 'search'}
	{@render back()}
	<div class="[&>.m3-container]:w-full">
		<TextFieldOutlined label="Search by code or title" type="search" bind:value={search} />
	</div>
	<section class={card}>
		<div class="divide-outline-variant bg-surface-container divide-y">
			{#each searchResults as course (course.code)}
				{@render row(course.code, course.title, 'muted', () =>
					go({ name: 'course', code: course.code })
				)}
			{:else}
				<div class="gap-2 p-4 flex flex-wrap items-center" role="status">
					<p
						class="m-0 text-sm"
						class:text-error={searchError}
						class:text-on-surface-variant={!searchError}
					>
						{search.trim().length < 2
							? 'Type at least two letters.'
							: searching
								? 'Searching…'
								: searchError || 'No courses match.'}
					</p>
					{#if searchError}<Button variant="text" onclick={() => searchAttempt++}>Retry</Button
						>{/if}
				</div>
			{/each}
		</div>
	</section>
{:else if !plan.published}
	<section class="gap-1 rounded-2xl bg-surface-container-low p-4 flex flex-col">
		<h2 class="m-0 text-base font-bold text-on-surface">Sections aren't posted yet</h2>
		<p class="m-0 text-sm text-on-surface-variant">
			Here's what your degree plan recommends for {plan.termName}. You can build a schedule once
			sections are posted.
		</p>
	</section>
	<section class={card}>
		<div class="divide-outline-variant bg-surface-container divide-y">
			{#each plan.suggestions as suggestion (suggestion.id)}
				{@const first = suggestion.options[0]}
				<div class="px-4 py-3">
					<span class="text-sm font-semibold text-on-surface block"
						>{suggestion.kind === 'course' && first
							? `${first.code} · ${first.title}`
							: suggestion.label}</span
					>
					<span class="text-xs text-on-surface-variant block"
						>{suggestion.kind === 'course' && first
							? prerequisiteLabel(first)
							: suggestion.reason}</span
					>
				</div>
			{:else}
				<p class="m-0 p-4 text-sm text-on-surface-variant">
					Your degree plan has nothing recommended for {plan.termName}.
				</p>
			{/each}
		</div>
	</section>
{:else}
	{@render top?.()}
	{#if plan.added.length}
		<section class={card}>
			<div class="divide-outline-variant bg-surface-container divide-y">
				<div class="gap-2 px-4 py-3 flex items-center justify-between">
					<div class="min-w-0">
						<h2 class="m-0 text-base font-bold text-on-surface">{plan.termName} schedule</h2>
						<p class="m-0 text-xs text-on-surface-variant">
							{plan.added.length}
							{plan.added.length === 1 ? 'course' : 'courses'} · {plan.credits} credits
						</p>
					</div>
					<button
						type="button"
						class="text-sm font-medium text-primary p-0 shrink-0 cursor-pointer border-0 bg-transparent"
						onclick={onschedule}>View calendar</button
					>
				</div>
				{#each plan.added as code (code)}
					{@const state = status(code)}
					{@render row(
						`${code} · ${plan.option(code).title}`,
						state.issue ??
							(state.lecture
								? `Section ${state.lecture.section_number} · ${meetingSummary(state.lecture, military)}`
								: ''),
						state.issue ? 'error' : 'ok',
						() => go({ name: 'course', code })
					)}
				{/each}
			</div>
		</section>
	{/if}
	{#if open.length}
		<section class={card}>
			<div class="divide-outline-variant bg-surface-container divide-y">
				<div class="px-4 py-3">
					<h2 class="m-0 text-base font-bold text-on-surface">
						{plan.added.length ? 'Not in your schedule' : `Recommended for ${plan.termName}`}
					</h2>
					<p class="m-0 text-xs text-on-surface-variant">
						{plan.added.length
							? 'Recommended, but not added. Tap one to add it.'
							: `From your ${plan.program?.plan ?? 'degree plan'}, plus courses you haven't taken yet.`}
					</p>
				</div>
				{#each open as suggestion (suggestion.id)}
					{@const option = suggestion.options[0]}
					{#if suggestion.kind === 'course' && option}
						{@render row(
							`${option.code} · ${option.title}`,
							option.prerequisites === 'not_met' ? prerequisiteLabel(option) : suggestion.reason,
							option.prerequisites === 'not_met' ? 'error' : 'muted',
							() => go({ name: 'course', code: option.code, fill: suggestion.id })
						)}
					{:else}
						{@render row(
							suggestion.label,
							`${suggestion.options.length} options · ${suggestion.reason}`,
							'muted',
							() => go({ name: 'slot', id: suggestion.id })
						)}
					{/if}
				{/each}
			</div>
		</section>
	{:else if !plan.added.length}
		<p class="m-0 px-1 text-sm text-on-surface-variant">
			Your degree plan has nothing recommended for {plan.termName}.
		</p>
	{/if}
	<div>
		<Button variant="text" onclick={() => go({ name: 'search' })}>Search all courses</Button>
	</div>
	{#if plan.added.length}<PlanBar onreview={() => (plan.stage = 'review')} />{/if}
{/if}
