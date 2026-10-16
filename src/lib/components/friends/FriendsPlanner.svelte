<script lang="ts">
	import DateField from '$lib/components/ui/DateField.svelte';
	import { PEOPLE_ICON, REFRESH_ICON } from '$lib/icons';
	import { dateLabel, formatTime, minutesTime, normalizeTime, timeMinutes } from '$lib/datetime';
	import { validDate } from '$lib/friends/schedule';
	import { providerLabel } from '$lib/friends/savedMeetings';
	import type {
		Participant,
		FriendGroup,
		MeetingPreferences,
		PlannerSlot,
		PlannerPreset,
		PlannerDraft
	} from '$lib/friends/types';
	import iconCheck from '@ktibow/iconset-material-symbols/check';
	import iconDown from '@ktibow/iconset-material-symbols/arrow-drop-down';
	import {
		Button,
		Checkbox,
		Chip,
		Dialog,
		ListItem,
		Menu,
		MenuItem,
		TextFieldOutlined
	} from 'm3-svelte';

	let {
		people,
		groups = [],
		selected = $bindable([]),
		preferences = $bindable(),
		presets,
		suggestions,
		windows = [],
		draft = null,
		draftConflict = false,
		militaryTime = false,
		loading = false,
		loadError = '',
		resultMessage = '',
		onfilters,
		onpeople,
		onchoose,
		oncontinue,
		ondiscard,
		disabled = false,
		onaddfriends,
		onretry,
		oncompare,
		onrefresh,
		refreshing = false,
		busy = false
	}: {
		people: Participant[];
		groups?: FriendGroup[];
		selected?: string[];
		preferences: MeetingPreferences;
		presets: PlannerPreset[];
		suggestions: PlannerSlot[];
		windows?: PlannerSlot[];
		draft?: PlannerDraft | null;
		draftConflict?: boolean;
		militaryTime?: boolean;
		loading?: boolean;
		loadError?: string;
		resultMessage?: string;
		onfilters?: () => void;
		onpeople?: () => void;
		onchoose: (slot: PlannerSlot) => void;
		oncontinue: () => void;
		ondiscard: () => void;
		disabled?: boolean;
		onaddfriends?: () => void;
		onretry?: () => void;
		oncompare: () => void;
		onrefresh: () => void;
		refreshing?: boolean;
		busy?: boolean;
	} = $props();

	let peopleOpen = $state(false);
	let search = $state('');
	let choosingCustomDuration = $state(false);
	let choosingCustomHours = $state(false);
	let choosingCustomBuffer = $state(false);
	let openMenu = $state('');
	let expanded = $state<Record<string, boolean>>({});
	let visibleDays = $state(3);
	let dayScope = '';
	$effect(() => {
		const scope = JSON.stringify({ preferences, selected });
		if (scope !== dayScope) {
			dayScope = scope;
			visibleDays = 3;
		}
	});
	const durationChoices = [15, 30, 45, 60, 90, 120];
	const bufferChoices = [0, 5, 10, 15];
	const hourChoices = [
		{ id: 'day', start: 9 * 60, end: 17 * 60 },
		{ id: 'morning', start: 8 * 60, end: 12 * 60 },
		{ id: 'afternoon', start: 12 * 60, end: 17 * 60 },
		{ id: 'wide', start: 8 * 60, end: 21 * 60 }
	];
	const selectedPeople = $derived(people.filter((person) => selected.includes(person.id)));
	const hasFriend = $derived(selected.some((id) => id !== 'you'));
	const availabilityOnly = $derived(
		selectedPeople.filter((person) => person.sharing === 'Availability only')
	);
	const unavailable = $derived(
		selectedPeople.filter((person) => person.sharing === 'Sharing unavailable')
	);
	const query = $derived(search.trim().toLowerCase());
	const filteredPeople = $derived(
		people.filter((person) => person.name.toLowerCase().includes(query))
	);
	const activePreset = $derived(presets.find((preset) => preset.id === preferences.preset));
	const choosingDates = $derived(!activePreset?.from);
	const dateProblem = $derived(
		!validDate(preferences.from) ||
			!validDate(preferences.until) ||
			preferences.from > preferences.until
	);
	const timeProblem = $derived.by(() => {
		const start = timeMinutes(preferences.dailyStart);
		const end = timeMinutes(preferences.dailyEnd);
		return start === undefined || end === undefined || start >= end;
	});
	const bufferProblem = $derived(
		!/^\d+$/.test(preferences.buffer) || Number(preferences.buffer) < 0
	);
	const durationProblem = $derived(
		!/^\d+$/.test(preferences.duration) || Number(preferences.duration) <= 0
	);
	const preferenceProblem = $derived(
		dateProblem
			? 'Choose a start date on or before the end date.'
			: timeProblem
				? 'Choose a daily start before the daily end.'
				: bufferProblem
					? 'Enter a buffer of zero or more minutes.'
					: durationProblem
						? 'Choose a meeting duration.'
						: ''
	);
	const customDuration = $derived(
		choosingCustomDuration ||
			!durationChoices.some((value) => String(value) === preferences.duration)
	);
	const customBuffer = $derived(
		choosingCustomBuffer || !bufferChoices.some((value) => String(value) === preferences.buffer)
	);
	const hourPreset = $derived(
		choosingCustomHours
			? 'custom'
			: (hourChoices.find(
					(choice) =>
						timeMinutes(preferences.dailyStart) === choice.start &&
						timeMinutes(preferences.dailyEnd) === choice.end
				)?.id ?? 'custom')
	);
	const whenLabel = $derived(
		choosingDates ? 'Custom Date' : (activePreset?.label ?? 'Custom Date')
	);
	const durationLabel = $derived(
		customDuration ? 'Custom Duration' : `${preferences.duration} min`
	);
	const bufferLabel = $derived.by(() => {
		if (customBuffer) return 'Custom Buffer';
		const minutes = Number(preferences.buffer);
		if (!Number.isInteger(minutes) || minutes < 0) return 'Buffer';
		return minutes === 0 ? 'No buffer' : `${minutes} min buffer`;
	});
	const who = $derived.by(() => {
		const names = selectedPeople.map((person) => person.name);
		if (names.length > 3) return `${names.slice(0, 2).join(', ')}, and ${names.length - 2} more`;
		return names.join(', ');
	});
	const peopleLabel = $derived(selectedPeople.length ? `Edit people · ${who}` : 'Choose people');

	function clock(value: string) {
		const minutes = timeMinutes(value);
		return minutes === undefined ? value : formatTime(minutesTime(minutes), militaryTime);
	}

	const hoursLabel = $derived(
		hourPreset === 'custom'
			? 'Custom Time'
			: `${clock(preferences.dailyStart)} - ${clock(preferences.dailyEnd)}`
	);

	function time(minutes: number) {
		return formatTime(minutesTime(minutes), militaryTime);
	}

	function knownMembers(members: string[]) {
		return members.filter((id) => people.some((person) => person.id === id));
	}

	function applyPreset(preset: PlannerPreset) {
		onfilters?.();
		preferences.preset = preset.id;
		if (preset.from && preset.until) {
			preferences.from = preset.from;
			preferences.until = preset.until;
		}
	}

	function setDuration(value: number) {
		onfilters?.();
		choosingCustomDuration = false;
		preferences.duration = String(value);
	}

	function setHours(start: number, end: number) {
		onfilters?.();
		choosingCustomHours = false;
		preferences.dailyStart = formatTime(minutesTime(start), militaryTime);
		preferences.dailyEnd = formatTime(minutesTime(end), militaryTime);
	}

	function setBuffer(value: number) {
		onfilters?.();
		choosingCustomBuffer = false;
		preferences.buffer = String(value);
	}

	function toggleBetween() {
		if (availabilityOnly.length) return;
		onfilters?.();
		preferences.betweenClasses = !preferences.betweenClasses;
	}

	function reconcile(next: string[]) {
		if (
			preferences.betweenClasses &&
			next.some((id) => people.find((person) => person.id === id)?.sharing === 'Availability only')
		)
			preferences.betweenClasses = false;
	}

	function finishSelection(next: string[]) {
		reconcile(next);
		selected = next;
		onpeople?.();
	}

	function togglePerson(id: string, checked: boolean) {
		finishSelection(
			checked ? [...new Set([...selected, id])] : selected.filter((item) => item !== id)
		);
	}

	function toggleGroup(members: string[], checked: boolean) {
		const known = knownMembers(members);
		finishSelection(
			checked ? [...new Set([...selected, ...known])] : selected.filter((id) => !known.includes(id))
		);
	}

	function openPeople() {
		search = '';
		peopleOpen = true;
	}

	function toggleMenu(id: string) {
		openMenu = openMenu === id ? '' : id;
	}

	function closeMenu() {
		openMenu = '';
	}

	function onFilterKey(event: KeyboardEvent) {
		if (openMenu && event.key === 'Escape') closeMenu();
	}

	function collapsedSlots(slots: PlannerSlot[]) {
		if (slots.length <= 3) return slots;
		const middle = Math.floor((slots.length - 1) / 2);
		return [slots[0], slots[middle], slots[slots.length - 1]].filter((slot) => slot !== undefined);
	}

	function toggleOpening(id: string) {
		expanded[id] = !expanded[id];
	}

	function draftMark(date: string) {
		const value = new Date(`${date}T00:00:00Z`);
		return {
			weekday: value.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
			day: String(value.getUTCDate())
		};
	}

	function draftMeta(item: PlannerDraft) {
		const parts: string[] = [];
		if (item.location?.trim()) parts.push(item.location.trim());
		if (item.frequency === 'weekly') parts.push('Weekly');
		if (item.calendar) parts.push(item.calendar.split(',').map(providerLabel).join(', '));
		if (item.invite === true) parts.push('Invites on');
		else if (item.invite === false) parts.push('Invites off');
		return parts.join(' · ');
	}

	function draftPeople(names: string[]) {
		if (names.length > 3) return `${names.slice(0, 2).join(', ')}, and ${names.length - 2} more`;
		return names.join(', ');
	}

	const days = $derived.by(() => {
		const placed: Record<string, true> = {};
		const grouped: Record<
			string,
			Array<{ id: string; start: number | null; end: number | null; slots: PlannerSlot[] }>
		> = {};
		const openingsFor = (date: string) => (grouped[date] ??= []);
		const orderedWindows = [...windows].sort(
			(left, right) => left.date.localeCompare(right.date) || left.start - right.start
		);
		for (const item of orderedWindows) {
			const slots = suggestions
				.filter(
					(slot) =>
						!placed[slot.id] &&
						slot.date === item.date &&
						slot.start >= item.start &&
						slot.end <= item.end
				)
				.sort((left, right) => left.start - right.start);
			if (!slots.length) continue;
			for (const slot of slots) placed[slot.id] = true;
			openingsFor(item.date).push({ id: item.id, start: item.start, end: item.end, slots });
		}
		for (const slot of suggestions) {
			if (placed[slot.id]) continue;
			const openings = openingsFor(slot.date);
			const loose = openings.find((item) => item.start === null);
			if (loose) loose.slots.push(slot);
			else openings.push({ id: `${slot.date}-other`, start: null, end: null, slots: [slot] });
		}
		return Object.keys(grouped)
			.sort()
			.map((date) => ({
				date,
				openings: (grouped[date] ?? []).map((opening) => {
					const collapsed = collapsedSlots(opening.slots);
					const open = expanded[opening.id] ?? false;
					return {
						...opening,
						open,
						shown: open ? opening.slots : collapsed,
						extra: opening.slots.length - collapsed.length
					};
				})
			}));
	});
</script>

<svelte:window onkeydown={onFilterKey} />

<section class="planner friends-preview" aria-label="Friends planning">
	<div class="people">
		<Button
			variant="outlined"
			iconType="left"
			disabled={disabled || loading || !people.some((person) => person.id !== 'you')}
			onclick={openPeople}
		>
			<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"
				><path fill="currentColor" d={PEOPLE_ICON} /></svg
			>
			{peopleLabel}
		</Button>
		<div class="page-actions">
			<Button variant="text" disabled={busy} onclick={oncompare}>Compare calendars</Button><Button
				variant="tonal"
				disabled={busy || refreshing}
				onclick={onrefresh}
				aria-label="Refresh friends"
				title="Refresh friends"
				><svg
					aria-hidden="true"
					width="20"
					height="20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
					class:animate-spin={refreshing}
					><path stroke-linecap="round" stroke-linejoin="round" d={REFRESH_ICON} /></svg
				></Button
			>
		</div>
	</div>
	{#if loading}
		<p class="m3-font-body-medium status" role="status">Loading friends…</p>
	{:else if loadError}
		<div class="empty" role="alert">
			<p class="m3-font-body-medium">{loadError}</p>
			{#if onretry}<Button variant="tonal" onclick={onretry}>Try again</Button>{/if}
		</div>
	{:else if !people.some((person) => person.id !== 'you')}
		<div class="empty">
			<p class="m3-font-body-medium">Add friends to start planning together.</p>
			{#if onaddfriends}
				<Button variant="tonal" iconType="left" onclick={onaddfriends}>
					<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"
						><path fill="currentColor" d={PEOPLE_ICON} /></svg
					>
					Add friends
				</Button>
			{/if}
		</div>
	{:else}
		<fieldset {disabled}>
			<div class="filters">
				<div class="filter-bar" aria-label="Planning preferences">
					<div class="filter">
						<Chip
							variant="general"
							selected={choosingDates || openMenu === 'when'}
							trailingIcon={iconDown}
							aria-haspopup="menu"
							aria-expanded={openMenu === 'when'}
							onclick={() => toggleMenu('when')}>{whenLabel}</Chip
						>
						{#if openMenu === 'when'}
							<button
								type="button"
								class="backdrop"
								aria-label="Close date filter"
								onclick={closeMenu}
							></button>
							<div class="filter-menu">
								<Menu>
									{#each presets as preset (preset.id)}
										<MenuItem
											icon={preferences.preset === preset.id ? iconCheck : 'space'}
											onclick={() => {
												applyPreset(preset);
												closeMenu();
											}}>{preset.from ? preset.label : 'Custom Date'}</MenuItem
										>
									{/each}
								</Menu>
							</div>
						{/if}
					</div>
					<div class="filter">
						<Chip
							variant="general"
							selected={customDuration || openMenu === 'length'}
							trailingIcon={iconDown}
							aria-haspopup="menu"
							aria-expanded={openMenu === 'length'}
							onclick={() => toggleMenu('length')}>{durationLabel}</Chip
						>
						{#if openMenu === 'length'}
							<button
								type="button"
								class="backdrop"
								aria-label="Close length filter"
								onclick={closeMenu}
							></button>
							<div class="filter-menu">
								<Menu>
									{#each durationChoices as value (value)}
										<MenuItem
											icon={!customDuration && preferences.duration === String(value)
												? iconCheck
												: 'space'}
											onclick={() => {
												setDuration(value);
												closeMenu();
											}}>{value} min</MenuItem
										>
									{/each}
									<MenuItem
										icon={customDuration ? iconCheck : 'space'}
										onclick={() => {
											onfilters?.();
											choosingCustomDuration = true;
											closeMenu();
										}}>Custom Duration</MenuItem
									>
								</Menu>
							</div>
						{/if}
					</div>
					<div class="filter">
						<Chip
							variant="general"
							selected={hourPreset === 'custom' || openMenu === 'hours'}
							trailingIcon={iconDown}
							aria-haspopup="menu"
							aria-expanded={openMenu === 'hours'}
							onclick={() => toggleMenu('hours')}>{hoursLabel}</Chip
						>
						{#if openMenu === 'hours'}
							<button
								type="button"
								class="backdrop"
								aria-label="Close hours filter"
								onclick={closeMenu}
							></button>
							<div class="filter-menu">
								<Menu>
									{#each hourChoices as choice (choice.id)}
										<MenuItem
											icon={hourPreset === choice.id ? iconCheck : 'space'}
											onclick={() => {
												setHours(choice.start, choice.end);
												closeMenu();
											}}>{time(choice.start)} - {time(choice.end)}</MenuItem
										>
									{/each}
									<MenuItem
										icon={hourPreset === 'custom' ? iconCheck : 'space'}
										onclick={() => {
											onfilters?.();
											choosingCustomHours = true;
											closeMenu();
										}}>Custom Time</MenuItem
									>
								</Menu>
							</div>
						{/if}
					</div>
					<div class="filter">
						<Chip
							variant="general"
							selected={customBuffer || openMenu === 'buffer'}
							trailingIcon={iconDown}
							aria-haspopup="menu"
							aria-expanded={openMenu === 'buffer'}
							onclick={() => toggleMenu('buffer')}>{bufferLabel}</Chip
						>
						{#if openMenu === 'buffer'}
							<button
								type="button"
								class="backdrop"
								aria-label="Close buffer filter"
								onclick={closeMenu}
							></button>
							<div class="filter-menu">
								<Menu>
									{#each bufferChoices as value (value)}
										<MenuItem
											icon={!customBuffer && preferences.buffer === String(value)
												? iconCheck
												: 'space'}
											onclick={() => {
												setBuffer(value);
												closeMenu();
											}}>{value === 0 ? 'No buffer' : `${value} min`}</MenuItem
										>
									{/each}
									<MenuItem
										icon={customBuffer ? iconCheck : 'space'}
										onclick={() => {
											onfilters?.();
											choosingCustomBuffer = true;
											closeMenu();
										}}>Custom Buffer</MenuItem
									>
								</Menu>
							</div>
						{/if}
					</div>
					<Chip
						variant="general"
						selected={preferences.betweenClasses}
						disabled={availabilityOnly.length > 0}
						icon={preferences.betweenClasses ? iconCheck : undefined}
						aria-pressed={preferences.betweenClasses}
						title={availabilityOnly.length
							? `Between classes stays off because ${availabilityOnly.map((person) => person.name).join(', ')} did not share class times.`
							: 'Only times between the earliest class start and the latest class end.'}
						onclick={toggleBetween}>Between classes</Chip
					>
				</div>
				{#if choosingDates || dateProblem}
					<div
						class="filter-extra preview-fields"
						oninput={() => onfilters?.()}
						onchange={() => onfilters?.()}
					>
						<DateField label="From" required error={dateProblem} bind:value={preferences.from} />
						<DateField label="Until" required error={dateProblem} bind:value={preferences.until} />
					</div>
				{/if}
				{#if customDuration || durationProblem}
					<div class="filter-extra preview-fields">
						<TextFieldOutlined
							label="Minutes"
							type="number"
							error={durationProblem}
							bind:value={
								() => preferences.duration, (value) => (preferences.duration = String(value ?? ''))
							}
							oninput={() => {
								onfilters?.();
								choosingCustomDuration = true;
							}}
						/>
					</div>
				{/if}
				{#if hourPreset === 'custom' || timeProblem}
					<div class="filter-extra preview-fields">
						<TextFieldOutlined
							label="Daily start"
							error={timeProblem}
							bind:value={preferences.dailyStart}
							oninput={() => onfilters?.()}
							onblur={() =>
								(preferences.dailyStart = normalizeTime(preferences.dailyStart, militaryTime))}
						/>
						<TextFieldOutlined
							label="Daily end"
							error={timeProblem}
							bind:value={preferences.dailyEnd}
							oninput={() => onfilters?.()}
							onblur={() =>
								(preferences.dailyEnd = normalizeTime(preferences.dailyEnd, militaryTime))}
						/>
					</div>
				{/if}
				{#if customBuffer || bufferProblem}
					<div class="filter-extra preview-fields">
						<TextFieldOutlined
							label="Buffer minutes"
							type="number"
							error={bufferProblem}
							bind:value={
								() => preferences.buffer, (value) => (preferences.buffer = String(value ?? ''))
							}
							oninput={() => {
								onfilters?.();
								choosingCustomBuffer = true;
							}}
						/>
					</div>
				{/if}
			</div>
		</fieldset>
		{#if draft}
			<section
				class={['card', 'draft', { unfit: draftConflict }]}
				aria-labelledby="meeting-draft-title"
			>
				<div class="draft-mark" aria-hidden="true">
					<span class="m3-font-label-medium">{draftMark(draft.date).weekday}</span>
					<span class="m3-font-title-medium">{draftMark(draft.date).day}</span>
				</div>
				<div class="draft-copy">
					<div class="draft-head">
						<p class="draft-kicker m3-font-label-large">Saved draft</p>
						<div class="draft-actions">
							<Button variant="text" {disabled} onclick={ondiscard}>Discard</Button>
							<Button variant="tonal" onclick={oncontinue}>Continue</Button>
						</div>
					</div>
					<h2 id="meeting-draft-title" class="m3-font-title-medium">
						{draft.title.trim() || 'Untitled meeting'}
					</h2>
					<p class="m3-font-body-medium">
						{dateLabel(draft.date)} · {time(draft.start)} - {time(draft.end)}
					</p>
					{#if draftMeta(draft)}
						<p class="m3-font-body-small hint">{draftMeta(draft)}</p>
					{/if}
					{#if draft.participantNames.length}
						<p class="m3-font-body-small hint">{draftPeople(draft.participantNames)}</p>
					{/if}
					{#if draftConflict}
						<p class="conflict m3-font-body-medium" role="alert">
							This time no longer fits. Continue to change it, or discard the draft.
						</p>
					{/if}
				</div>
			</section>
		{/if}

		<section class="card results" aria-labelledby="suggested-times-title">
			<div>
				<h2 id="suggested-times-title" class="m3-font-title-medium">Suggested times</h2>
				{#if hasFriend && who}
					<p class="m3-font-body-medium hint">
						Concrete {preferences.duration}-minute meetings for {who}.
					</p>
				{/if}
			</div>
			{#if preferenceProblem}
				<p class="conflict m3-font-body-medium" role="alert">{preferenceProblem}</p>
			{:else if !hasFriend}
				<p class="m3-font-body-medium status" role="status">Choose at least one friend.</p>
			{:else if !suggestions.length}
				<p class="m3-font-body-medium status" role="status">
					{resultMessage || `No ${preferences.duration}-minute meeting fits these hours.`}
				</p>
			{:else}
				{#if unavailable.length}
					<p class="m3-font-body-small hint">
						{unavailable.map((person) => person.name).join(', ')} did not share a schedule, so these
						times do not include them.
					</p>
				{/if}
				<div class="days">
					{#each days.slice(0, visibleDays) as day (day.date)}
						<section class="day" aria-labelledby="day-{day.date}">
							<h3 id="day-{day.date}" class="m3-font-title-small">{dateLabel(day.date)}</h3>
							<div class="openings">
								{#each day.openings as opening (opening.id)}
									<div class="opening" role="group" aria-labelledby="opening-{opening.id}">
										<p id="opening-{opening.id}" class="m3-font-label-large">
											{#if opening.start !== null && opening.end !== null}
												Free {time(opening.start)} - {time(opening.end)}
											{:else}
												Other times
											{/if}
										</p>
										<div class="times">
											{#each opening.shown as slot (slot.id)}
												<Button
													variant="outlined"
													square
													aria-label={`${dateLabel(slot.date)}, ${time(slot.start)} to ${time(slot.end)}`}
													{disabled}
													onclick={() => onchoose(slot)}
												>
													{time(slot.start)} - {time(slot.end)}
												</Button>
											{/each}
											{#if opening.extra}
												<Button
													variant="outlined"
													square
													aria-expanded={opening.open}
													aria-label={opening.open
														? `Show fewer start times on ${dateLabel(day.date)}`
														: opening.start !== null && opening.end !== null
															? `Show ${opening.extra} more start times on ${dateLabel(day.date)}, free ${time(opening.start)} to ${time(opening.end)}`
															: `Show ${opening.extra} more start times on ${dateLabel(day.date)}`}
													onclick={() => toggleOpening(opening.id)}
												>
													{opening.open ? 'Show less' : `+ ${opening.extra}`}
												</Button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
				{#if days.length > visibleDays}
					<Button
						variant="text"
						aria-label="Show more suggested days"
						onclick={() => (visibleDays += 3)}>Show more</Button
					>
				{/if}
			{/if}
		</section>

		<div class="picker-host">
			<Dialog bind:open={peopleOpen} headline="People" role="dialog" aria-label="Select people">
				{#snippet buttons()}
					<div class="picker-actions">
						<span class="m3-font-body-small hint">{selectedPeople.length} selected</span>
						<Button onclick={() => (peopleOpen = false)}>Done</Button>
					</div>
				{/snippet}
				<div class="picker-body">
					<div class="preview-fields">
						<TextFieldOutlined label="Search people" type="search" bind:value={search} />
					</div>
					{#if query}
						<Button variant="text" onclick={() => (search = '')}>Clear search</Button>
						{#if groups.length}
							<p class="m3-font-body-small hint">Groups stay hidden while searching people.</p>
						{/if}
					{/if}
					{#if query && !filteredPeople.length}
						<p class="m3-font-body-medium status" role="status">
							No people match “{search.trim()}”.
						</p>
					{/if}
					{#if !query && groups.length}
						<p class="group-label m3-font-label-large">Groups</p>
						<ul class="preview-list people-list">
							{#each groups as group (group.id)}
								{@const members = knownMembers(group.members)}
								{@const count = members.filter((id) => selected.includes(id)).length}
								<li>
									<ListItem
										label
										headline={group.name}
										supporting={`${count} of ${members.length} selected`}
									>
										{#snippet leading()}
											<span
												class={[
													'preview-group-checkbox',
													{ partial: count > 0 && count < members.length }
												]}
											>
												<Checkbox>
													<input
														type="checkbox"
														checked={members.length > 0 && count === members.length}
														disabled={!members.length}
														indeterminate={count > 0 && count < members.length}
														onchange={(event) => toggleGroup(members, event.currentTarget.checked)}
													/>
												</Checkbox>
											</span>
										{/snippet}
									</ListItem>
								</li>
							{/each}
						</ul>
						<p class="group-label m3-font-label-large">Friends</p>
					{/if}
					<ul class="preview-list people-list">
						{#each filteredPeople as person (person.id)}
							<li>
								<ListItem
									label
									headline={person.name}
									supporting={person.id === 'you' ? 'Include your own schedule' : person.sharing}
								>
									{#snippet leading()}
										<Checkbox>
											<input
												type="checkbox"
												checked={selected.includes(person.id)}
												onchange={(event) => togglePerson(person.id, event.currentTarget.checked)}
											/>
										</Checkbox>
									{/snippet}
								</ListItem>
							</li>
						{/each}
					</ul>
					<Button
						variant="text"
						onclick={() =>
							finishSelection(people.some((person) => person.id === 'you') ? ['you'] : [])}
						>Clear friends</Button
					>
				</div>
			</Dialog>
		</div>
	{/if}
</section>

<style>
	fieldset {
		display: contents;
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.planner {
		display: grid;
		gap: 1rem;
		min-width: 0;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.page-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}
	.people {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.people > :global(button) {
		max-width: 100%;
		height: auto;
		min-height: 2.5rem;
		white-space: normal;
	}
	.people,
	.card,
	.empty {
		min-width: 0;
	}
	.draft-actions,
	.picker-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.people-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.filters {
		display: grid;
		gap: 0.75rem;
	}
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.filter-extra {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.filter-extra > :global(.date-field),
	.filter-extra > :global(.m3-container) {
		flex: 1 1 14rem;
		width: auto;
		max-width: 16rem;
	}
	.filter {
		position: relative;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 3;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: default;
	}
	.filter-menu {
		position: absolute;
		z-index: 4;
		top: calc(100% + 0.25rem);
		left: 0;
	}
	.card {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		background: rgb(var(--m3-scheme-surface-container-low));
		border: 1px solid rgb(var(--m3-scheme-outline-variant));
		border-radius: var(--m3-util-rounding-large);
	}
	.card > :global(button) {
		justify-self: start;
	}
	.hint {
		color: rgb(var(--m3-scheme-on-surface-variant));
	}
	.hint,
	.status,
	.conflict {
		margin: 0;
	}
	.draft {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		column-gap: 1rem;
		background: rgb(var(--m3-scheme-surface-container));
	}
	.draft-mark {
		display: grid;
		justify-items: center;
		align-content: center;
		width: 3.25rem;
		min-height: 3.25rem;
		padding: 0.25rem;
		border-radius: var(--m3-util-rounding-medium);
		background: rgb(var(--m3-scheme-primary-container));
		color: rgb(var(--m3-scheme-on-primary-container));
		text-transform: uppercase;
	}
	.draft-mark span {
		line-height: 1.1;
	}
	.draft.unfit {
		border-color: rgb(var(--m3-scheme-error));
	}
	.draft.unfit .draft-mark {
		background: rgb(var(--m3-scheme-error-container));
		color: rgb(var(--m3-scheme-on-error-container));
	}
	.draft-copy {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}
	.draft-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.draft-kicker {
		margin: 0;
		color: rgb(var(--m3-scheme-primary));
	}
	.draft.unfit .draft-kicker {
		color: rgb(var(--m3-scheme-error));
	}
	.draft-actions {
		justify-content: flex-end;
		flex: 0 0 auto;
	}
	.results {
		gap: 0.75rem;
	}
	.days,
	.day,
	.openings,
	.opening {
		display: grid;
		min-width: 0;
	}
	.days,
	.day,
	.openings {
		gap: 0.75rem;
	}
	.opening {
		gap: 0.375rem;
	}
	.day h3,
	.opening p {
		margin: 0;
	}
	.times {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.times :global(button) {
		width: auto;
		height: auto;
		min-height: 2.5rem;
	}
	.empty {
		display: grid;
		justify-items: start;
		gap: 0.75rem;
		padding: 1rem;
		background: rgb(var(--m3-scheme-surface-container-low));
		border-radius: var(--m3-util-rounding-large);
	}
	.conflict {
		color: rgb(var(--m3-scheme-error));
	}
	.group-label {
		margin: 0.5rem 0 0;
		color: rgb(var(--m3-scheme-primary));
	}
	.people-list {
		display: block;
	}
	.picker-host :global(dialog) {
		width: min(28rem, calc(100vw - 1.5rem));
		min-width: 0;
		max-height: calc(100dvh - 2rem);
		overflow: hidden;
	}
	.picker-host :global(.content) {
		min-height: 0;
		overflow: auto;
		margin-bottom: 1rem;
	}
	.picker-body {
		display: grid;
		gap: 0.75rem;
		color: rgb(var(--m3-scheme-on-surface));
	}
	.picker-actions {
		width: 100%;
	}
	@media (max-width: 480px) {
		.filter-extra > :global(.date-field),
		.filter-extra > :global(.m3-container) {
			max-width: none;
		}
		.draft-head {
			align-items: flex-start;
			flex-direction: column;
		}
		.picker-host :global(dialog) {
			padding: 1.25rem;
		}
	}
</style>
