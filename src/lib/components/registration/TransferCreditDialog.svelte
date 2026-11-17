<script lang="ts">
	import {
		Button,
		Checkbox,
		ConnectedButtons,
		Dialog,
		Icon,
		LoadingIndicator,
		TextFieldOutlined
	} from 'm3-svelte';
	import iconRemove from '@ktibow/iconset-material-symbols/close-rounded';
	import iconOpen from '@ktibow/iconset-material-symbols/open-in-new-rounded';
	import { API } from '$lib/api';
	import { openStudentSignIn } from '$lib/calendar/academicProfile';
	import type { FoundCredit } from '$lib/calendar/transferCredits';
	import { errorText } from '$lib/registration/source.svelte';
	import {
		TRANSFER_KINDS,
		kindLabel,
		type TransferCredits
	} from '$lib/registration/transferCredits.svelte';
	import type { CourseSummary, TransferCredit, TransferKind } from '$lib/registration/types';

	let { credits }: { credits: TransferCredits } = $props();
	const id = $props.id();
	const list = $derived(credits.list);
	let kind = $state<TransferKind>('ap');
	let search = $state('');
	let results = $state<CourseSummary[]>([]);
	let searching = $state(false);
	let searchError = $state('');
	let version = 0;

	$effect(() => {
		if (!credits.open) search = '';
	});

	$effect(() => {
		const query = search.trim();
		const current = ++version;
		searchError = '';
		if (!credits.open || query.length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		const timer = setTimeout(async () => {
			try {
				const found = await API.searchCourses(query);
				if (current === version) results = found;
			} catch (error) {
				if (current === version) searchError = errorText(error);
			} finally {
				if (current === version) searching = false;
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	function meta(credit: TransferCredit) {
		return [
			credit.credits === null ? null : `${credit.credits} credits`,
			kindLabel(credit.kind),
			credit.source === 'transcript' ? 'From transcript' : 'Added by you'
		]
			.filter(Boolean)
			.join(' · ');
	}

	function foundMeta(credit: FoundCredit) {
		return [
			credit.credits === null ? null : `${credit.credits} credits`,
			kindLabel(credit.kind),
			credit.source
		]
			.filter(Boolean)
			.join(' · ');
	}

	const reasons: Record<string, string> = {
		not_a_course_code: 'not a WIT course code',
		duplicate: 'listed twice',
		student_entry: 'you already added it',
		invalid: 'its credits could not be read'
	};

	async function add(course: CourseSummary) {
		if (await credits.add(course, kind)) search = '';
	}
</script>

<Dialog
	bind:open={credits.open}
	headline="AP and transfer credit"
	role="dialog"
	aria-label="AP and transfer credit"
	closedby={credits.busy ? 'none' : 'any'}
>
	{#snippet buttons()}
		{#if credits.canConfirm}
			<Button variant="text" disabled={Boolean(credits.busy)} onclick={() => (credits.open = false)}
				>Not now</Button
			>
			<Button disabled={Boolean(credits.busy)} onclick={() => void credits.confirm()}
				>{credits.busy === 'confirm' ? 'Saving…' : 'Confirm'}</Button
			>
		{:else}
			<Button disabled={Boolean(credits.busy)} onclick={() => (credits.open = false)}>Done</Button>
		{/if}
	{/snippet}
	<div class="gap-4 flex w-[min(28rem,calc(100vw-6rem))] flex-col">
		<p class="m-0 text-sm">
			Credit from AP exams, tests and other schools counts toward your degree. Your LeopardWeb
			transcript lists what WIT has accepted.
		</p>
		<a
			class="gap-1 text-sm font-medium text-primary inline-flex items-center self-start"
			href="https://selfservice.wit.edu/StudentSelfService/ssb/academicTranscript"
			target="_blank"
			rel="noreferrer">Check your transcript in LeopardWeb<Icon icon={iconOpen} size={16} /></a
		>

		<section class="gap-2 flex flex-col" aria-labelledby={`${id}-found`}>
			<div class="gap-2 flex items-center justify-between">
				<h3 id={`${id}-found`} class="m-0 text-sm font-bold text-on-surface">On your transcript</h3>
				<button
					type="button"
					class="link text-xs font-medium text-primary p-0 shrink-0 cursor-pointer border-0 bg-transparent"
					disabled={credits.reading || Boolean(credits.busy)}
					onclick={() => void credits.check()}
					>{credits.found || credits.readError ? 'Check again' : 'Check transcript'}</button
				>
			</div>
			{#if credits.reading}
				<div class="gap-2 text-sm flex items-center" role="status" aria-busy="true">
					<LoadingIndicator size={24} center={false} />Checking your LeopardWeb transcript…
				</div>
			{:else if credits.readError}
				<p class="m-0 text-sm text-error" role="alert">{credits.readError}</p>
				{#if credits.loginUrl}
					<div>
						<Button variant="tonal" onclick={() => openStudentSignIn(credits.loginUrl!)}
							>Sign in to LeopardWeb</Button
						>
					</div>
				{/if}
			{:else if !credits.found}
				<p class="m-0 text-sm">Read your AP and transfer credit from LeopardWeb.</p>
			{:else if !credits.found.length}
				<p class="m-0 text-sm">Your transcript doesn't list any AP or transfer credit.</p>
			{:else}
				{#if credits.countable.length}
					{#if credits.needsReview}
						<p class="m-0 text-sm">
							Check that these match your transcript, then confirm. Untick any that are wrong.
						</p>
					{/if}
					<ul class="m-0 gap-1 p-0 flex list-none flex-col" aria-label="Found on your transcript">
						{#each credits.countable as credit (credit.code)}
							<li>
								<label
									class="gap-3 rounded-xl bg-surface-container px-3 py-2 flex cursor-pointer items-center"
								>
									<Checkbox>
										<input
											type="checkbox"
											checked={credits.selected.includes(credit.code)}
											disabled={Boolean(credits.busy)}
											onchange={(event) => credits.toggle(credit.code, event.currentTarget.checked)}
										/>
									</Checkbox>
									<span class="min-w-0 flex-1">
										<span class="text-sm font-semibold text-on-surface block"
											>{credit.code}{credit.title ? ` · ${credit.title}` : ''}</span
										>
										<span class="text-xs block">{foundMeta(credit)}</span>
									</span>
								</label>
							</li>
						{/each}
					</ul>
				{/if}
				{#if credits.other.length}
					<p class="m-0 text-xs">
						{credits.other.length === 1 ? 'This is' : 'These are'} general credit, not a specific WIT
						course, so {credits.other.length === 1 ? 'it' : 'they'} can't count automatically. If {credits
							.other.length === 1
							? 'it fills'
							: 'one fills'} a requirement, add the course below.
					</p>
					<ul class="m-0 gap-1 p-0 flex list-none flex-col" aria-label="General credit">
						{#each credits.other as credit, index (index)}
							<li class="rounded-xl bg-surface-container px-3 py-2">
								<span class="text-sm font-semibold text-on-surface block"
									>{credit.code}{credit.title ? ` · ${credit.title}` : ''}</span
								>
								<span class="text-xs block">{foundMeta(credit)}</span>
							</li>
						{/each}
					</ul>
				{/if}
				{#if credits.skipped.length}
					<p class="m-0 text-xs text-error" role="alert">
						Not saved: {credits.skipped
							.map((entry) => `${entry.code} (${reasons[entry.reason] ?? entry.reason})`)
							.join(', ')}.
					</p>
				{/if}
			{/if}
		</section>

		<section class="gap-2 flex flex-col" aria-labelledby={`${id}-saved`}>
			<h3 id={`${id}-saved`} class="m-0 text-sm font-bold text-on-surface">Your credit</h3>
			{#if list.error}
				<p class="m-0 text-sm text-error" role="alert">{list.error}</p>
				<div>
					<Button variant="tonal" onclick={() => void list.retry()}>Try again</Button>
				</div>
			{:else if !list.data}
				<div class="gap-2 text-sm flex items-center" role="status" aria-busy="true">
					<LoadingIndicator size={24} center={false} />Loading your credit…
				</div>
			{:else if !list.data.length}
				<p class="m-0 text-sm">None yet.</p>
			{:else}
				<ul class="m-0 gap-1 p-0 flex list-none flex-col">
					{#each list.data as credit (credit.code)}
						<li class="gap-2 rounded-xl bg-surface-container px-3 py-2 flex items-center">
							<span class="min-w-0 flex-1">
								<span class="text-sm font-semibold text-on-surface block"
									>{credit.code}{credit.title ? ` · ${credit.title}` : ''}</span
								>
								<span class="text-xs block">{meta(credit)}</span>
							</span>
							{#if credit.removable}
								<button
									type="button"
									class="remove p-1 text-on-surface-variant flex shrink-0 cursor-pointer rounded-full border-0 bg-transparent"
									aria-label={`Remove ${credit.code}`}
									disabled={Boolean(credits.busy)}
									onclick={() => void credits.remove(credit.code)}
									><Icon icon={iconRemove} size={20} /></button
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if list.data}
			<section class="gap-2 flex flex-col" aria-labelledby={`${id}-add`}>
				<h3 id={`${id}-add`} class="m-0 text-sm font-bold text-on-surface">Add credit</h3>
				<div class="[&>.m3-container]:flex! [&>.m3-container]:flex-wrap!">
					<ConnectedButtons>
						{#each TRANSFER_KINDS as entry (entry.value)}
							<input
								type="radio"
								name={`${id}-kind`}
								id={`${id}-${entry.value}`}
								value={entry.value}
								bind:group={kind}
							/>
							<Button for={`${id}-${entry.value}`}>{entry.label}</Button>
						{/each}
					</ConnectedButtons>
				</div>
				<TextFieldOutlined label="WIT course it counts as" type="search" bind:value={search} />
				{#if credits.error}
					<p class="m-0 text-sm text-error" role="alert">{credits.error}</p>
				{/if}
				{#if searchError}
					<p class="m-0 text-sm text-error" role="alert">{searchError}</p>
				{:else if searching}
					<p class="m-0 text-sm" role="status">Searching…</p>
				{:else if search.trim().length >= 2 && !results.length}
					<p class="m-0 text-sm" role="status">No courses match “{search.trim()}”.</p>
				{:else if results.length}
					<ul class="m-0 p-0 flex list-none flex-col" aria-label="Matching courses">
						{#each results as course (course.code)}
							{@const added = credits.has(course.code)}
							<li>
								<button
									type="button"
									class="result gap-2 px-3 py-2 rounded-xl flex w-full cursor-pointer items-center border-0 bg-transparent text-left"
									disabled={added || Boolean(credits.busy)}
									onclick={() => void add(course)}
								>
									<span class="min-w-0 flex-1">
										<span class="text-sm font-semibold text-on-surface block"
											>{course.code}{course.title ? ` · ${course.title}` : ''}</span
										>
										{#if course.credits !== null}
											<span class="text-xs block">{course.credits} credits</span>
										{/if}
									</span>
									<span class="text-xs font-medium text-primary shrink-0"
										>{added
											? 'Added'
											: credits.busy === course.code
												? 'Adding…'
												: `Add as ${kindLabel(kind)}`}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</div>
</Dialog>

<style>
	.result:hover:not(:disabled),
	.remove:hover:not(:disabled) {
		background: rgb(var(--m3-scheme-on-surface) / 0.08);
	}
	.result:disabled {
		cursor: default;
	}
	.link:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.result:focus-visible,
	.remove:focus-visible,
	.link:focus-visible {
		outline: 2px solid rgb(var(--m3-scheme-primary));
		outline-offset: -2px;
	}
</style>
