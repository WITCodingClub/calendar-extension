<script lang="ts">
	import { Button, Icon, Slider } from 'm3-svelte';
	import iconBack from '@ktibow/iconset-material-symbols/arrow-back-rounded';
	import { formatTime } from '$lib/datetime';
	import { userSettings } from '$lib/stores';
	import { DAY_LONG, STEPS, clock, type Prefs } from '$lib/registration/builder';
	import { getRegistrationPlan } from '$lib/registration/plan.svelte';
	import FinderControls from './FinderControls.svelte';

	type Choice = { value: string; title: string; detail: string; art?: number[][] };

	let { onshow }: { onshow: () => void } = $props();
	const plan = getRegistrationPlan();
	const id = $props.id();
	const military = $derived($userSettings?.military_time ?? true);
	const position = $derived(plan.step ? STEPS.indexOf(plan.step) : 0);
	const count = $derived(plan.count?.count ?? 0);
	const last = $derived(position === STEPS.length - 1);
	const clockLabel = (value: number) => formatTime(clock(value), military);
	const dayChoices: Choice[] = [
		{
			value: 'fewer',
			title: 'Fewer, longer days',
			detail: 'More time off campus',
			art: [
				[0, 90],
				[0, 0],
				[0, 85],
				[0, 0],
				[0, 70]
			]
		},
		{
			value: 'spread',
			title: 'More, shorter days',
			detail: 'Lighter load each day',
			art: [
				[10, 45],
				[30, 60],
				[10, 45],
				[30, 60],
				[10, 40]
			]
		},
		{ value: 'any', title: "Doesn't matter", detail: 'Show me everything' }
	];
	const breakChoices: Choice[] = [
		{
			value: 'tight',
			title: 'Back-to-back',
			detail: 'Get in, get done',
			art: [
				[10, 70],
				[0, 0],
				[10, 70],
				[0, 0],
				[10, 70]
			]
		},
		{
			value: 'lunch',
			title: 'Time for lunch',
			detail: 'A break around midday',
			art: [
				[10, 35],
				[0, 0],
				[10, 35],
				[0, 0],
				[10, 35]
			]
		},
		{ value: 'any', title: "Doesn't matter", detail: 'Gaps are fine' }
	];
	const offChoices: Choice[] = [
		{ value: 'none', title: 'No', detail: 'Classes any weekday' },
		{ value: 'any', title: 'Yes, any day', detail: "We'll pick whichever works best" },
		{ value: 'pick', title: 'Yes, a specific day', detail: 'Choose below' }
	];
	const seatChoices: Choice[] = [
		{ value: 'open', title: 'Only open seats', detail: 'Best chance of getting in' },
		{ value: 'wait', title: 'Include waitlists', detail: 'More options, but you might not get in' }
	];

	function setPrefs(patch: Partial<Prefs>) {
		plan.prefs = { ...plan.prefs, ...patch };
	}

	function next() {
		if (last) return onshow();
		plan.step = STEPS[position + 1];
		window.scrollTo({ top: 0 });
	}
</script>

{#snippet card(group: string, choice: Choice, current: string, onpick: () => void)}
	<label
		class="gap-3 p-3 rounded-2xl border-outline-variant has-checked:border-primary has-checked:bg-primary-container/40 has-focus-visible:outline-primary flex cursor-pointer items-center border-2 has-focus-visible:outline-2"
	>
		<input
			type="radio"
			class="sr-only"
			name={`${id}-${group}`}
			checked={current === choice.value}
			onchange={onpick}
		/>
		{#if choice.art}
			<span class="w-16 flex shrink-0 flex-col gap-[3px]" aria-hidden="true">
				{#each choice.art as row, index (index)}
					<span class="h-1.5 bg-surface-container-highest relative block rounded-full">
						{#if row[1] > row[0]}<span
								class="bg-primary inset-y-0 absolute block rounded-full"
								style:left={`${row[0]}%`}
								style:width={`${row[1] - row[0]}%`}
							></span>{/if}
					</span>
				{/each}
			</span>
		{/if}
		<span class="min-w-0 flex-1">
			<span class="text-sm font-semibold text-on-surface block">{choice.title}</span>
			<span class="text-xs text-on-surface-variant block">{choice.detail}</span>
		</span>
	</label>
{/snippet}

<div class="gap-2 flex items-center">
	<div class="-ml-2">
		<Button
			variant="text"
			iconType="left"
			onclick={() => (plan.step = position ? STEPS[position - 1] : null)}
			><Icon icon={iconBack} />Back</Button
		>
	</div>
	<div class="gap-1 ml-auto flex" aria-label={`Question ${position + 1} of ${STEPS.length}`}>
		{#each STEPS as entry, index (entry)}
			<span
				class="h-1.5 w-5 rounded-full"
				class:bg-primary={index <= position}
				class:bg-surface-container-highest={index > position}
			></span>
		{/each}
	</div>
</div>

<section class="gap-3 rounded-2xl bg-surface-container p-4 flex flex-col">
	{#if plan.step === 'courses'}
		<h2 class="m-0 text-lg font-bold text-on-surface">Which courses should we fit in?</h2>
		<p class="m-0 text-sm text-on-surface-variant">
			These are the courses your degree plan recommends for this term. Uncheck any you don't want.
		</p>
		<FinderControls />
	{:else if plan.step === 'days'}
		<h2 class="m-0 text-lg font-bold text-on-surface">How do you like your days?</h2>
		{#each dayChoices as choice (choice.value)}
			{@render card('days', choice, plan.prefs.days, () =>
				setPrefs({ days: choice.value as Prefs['days'] })
			)}
		{/each}
	{:else if plan.step === 'hours'}
		<h2 class="m-0 text-lg font-bold text-on-surface">When can you be in class?</h2>
		<div class="gap-1 pt-2 flex flex-col">
			<span class="text-sm"
				>First class no earlier than <strong>{clockLabel(plan.prefs.earliest)}</strong></span
			>
			<Slider
				min={480}
				max={720}
				step={30}
				aria-label="Earliest class"
				showValue={false}
				format={clockLabel}
				bind:value={() => plan.prefs.earliest, (v) => setPrefs({ earliest: v })}
			/>
		</div>
		<div class="gap-1 pt-2 flex flex-col">
			<span class="text-sm"
				>Last class done by <strong>{clockLabel(plan.prefs.latest)}</strong></span
			>
			<Slider
				min={720}
				max={1320}
				step={30}
				aria-label="Latest class end"
				showValue={false}
				format={clockLabel}
				bind:value={() => plan.prefs.latest, (v) => setPrefs({ latest: v })}
			/>
		</div>
		<p class="m-0 mt-2 text-xs text-on-surface-variant">Your class window</p>
		<div class="h-3 bg-surface-container-highest relative rounded-full" aria-hidden="true">
			<span
				class="bg-primary inset-y-0 absolute rounded-full"
				style:left={`${((plan.prefs.earliest - 480) / 840) * 100}%`}
				style:width={`${((plan.prefs.latest - plan.prefs.earliest) / 840) * 100}%`}
			></span>
		</div>
		<div class="text-on-surface-variant flex justify-between text-[10px]" aria-hidden="true">
			<span>{clockLabel(480)}</span><span>{clockLabel(720)}</span><span>{clockLabel(960)}</span
			><span>{clockLabel(1320)}</span>
		</div>
	{:else if plan.step === 'off'}
		<h2 class="m-0 text-lg font-bold text-on-surface">Want a weekday off?</h2>
		{#each offChoices as choice (choice.value)}
			{@render card('off', choice, plan.offMode, () => (plan.offMode = choice.value as 'none'))}
		{/each}
		{#if plan.offMode === 'pick'}
			<div class="gap-2 flex flex-wrap" role="group" aria-label="Days off">
				{#each Object.entries(DAY_LONG) as [key, label] (key)}
					{@const on = plan.offDays.includes(key)}
					<button
						type="button"
						class="h-11 min-w-11 px-3 text-sm font-semibold cursor-pointer rounded-full border-2 transition-colors"
						class:bg-primary={on}
						class:text-on-primary={on}
						class:border-primary={on}
						class:border-outline-variant={!on}
						class:bg-transparent={!on}
						class:text-on-surface={!on}
						aria-pressed={on}
						onclick={() =>
							(plan.offDays = on ? plan.offDays.filter((d) => d !== key) : [...plan.offDays, key])}
						>{label.slice(0, 3)}</button
					>
				{/each}
			</div>
		{/if}
	{:else if plan.step === 'breaks'}
		<h2 class="m-0 text-lg font-bold text-on-surface">Breaks between classes?</h2>
		{#each breakChoices as choice (choice.value)}
			{@render card('breaks', choice, plan.prefs.breaks, () =>
				setPrefs({ breaks: choice.value as Prefs['breaks'] })
			)}
		{/each}
	{:else}
		<h2 class="m-0 text-lg font-bold text-on-surface">What about full sections?</h2>
		{#each seatChoices as choice (choice.value)}
			{@render card('seats', choice, plan.prefs.openOnly ? 'open' : 'wait', () =>
				setPrefs({ openOnly: choice.value === 'open' })
			)}
		{/each}
		<p class="m-0 text-xs text-on-surface-variant">Seat counts can be up to 30 minutes old.</p>
	{/if}
</section>

<div
	class="bottom-3 gap-2 rounded-2xl bg-surface-container-high p-3 sticky z-30 flex flex-col shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.16)]"
>
	<div class="gap-x-3 gap-y-1 flex flex-wrap items-center">
		<p class="m-0 min-w-0 text-sm flex-1" role="status">
			{#if plan.step === 'courses'}
				{plan.finderIncluded.length} courses picked
			{:else if plan.busy}
				Busy, try again in a moment
			{:else if plan.builderError}
				<span class="text-error">{plan.builderError}</span>
			{:else if plan.finding}
				Finding schedules…
			{:else if !plan.count && plan.counting}
				Counting schedules…
			{:else if count}
				<strong>{plan.countText}</strong>
				{count === 1 ? 'schedule matches' : 'schedules match'} so far
			{:else}
				<strong class="text-error">Nothing matches</strong>
			{/if}
		</p>
		<div class="gap-2 ml-auto flex shrink-0 items-center">
			{#if plan.step !== 'courses' && (plan.busy || plan.builderError)}<Button
					variant="text"
					onclick={() => plan.retryBuilder()}>Retry</Button
				>{:else if plan.step !== 'courses' && !last && count}<Button
					variant="text"
					disabled={plan.finding}
					onclick={onshow}>Skip to results</Button
				>{/if}
			<Button
				disabled={plan.step === 'courses'
					? !plan.finderIncluded.length
					: plan.busy || plan.finding || !count}
				onclick={next}>{last ? `See ${plan.countText} schedules` : 'Next'}</Button
			>
		</div>
	</div>
	{#each plan.busy || plan.step === 'courses' ? [] : plan.relax as option (option.preference)}
		<div>
			<Button variant="outlined" onclick={() => plan.applyRelax(option)}
				>{option.label} ({option.count} fit)</Button
			>
		</div>
	{/each}
</div>
