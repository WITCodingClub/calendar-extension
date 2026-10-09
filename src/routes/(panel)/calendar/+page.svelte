<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import {
		processedData as storedProcessedData,
		icsUrl as storedIcsUrl,
		userSettings as storedUserSettings,
		enrolledTerms
	} from '$lib/stores';
	import type {
		Course,
		GetPreferencesResponse,
		MeetingTime,
		ResponseData,
		TermResponse
	} from '$lib/types';
	import { Button, LoadingIndicator, snackbar } from 'm3-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { API } from '$lib/api';
	import { AuthError, checkBetaAccess, getUsableJwt } from '$lib/auth/session';
	import { copyIcsUrl } from '$lib/browser/clipboard';
	import { track } from '$lib/browser/telemetry';
	import {
		calendarStartHour as startHourFor,
		earliestOffset,
		latestEndHour,
		stackMeetings
	} from '$lib/calendar/layout';
	import { fetchRegistrationEvents, importSchedule } from '$lib/calendar/leopardWeb';
	import {
		applyPreferences,
		fetchPreferences,
		mergeProcessedClasses,
		upsertProcessedTerm
	} from '$lib/calendar/processedTerms';
	import { todayDate, weekDates } from '$lib/datetime';
	import { savedMeetingCourses, type SavedMeetingsResponse } from '$lib/friends/savedMeetings';
	import { getPanelSession } from '$lib/panel/session';
	import { getPanelUi } from '$lib/panel/ui.svelte';
	import CalendarGrid from '$lib/components/calendar/CalendarGrid.svelte';
	import EventEditorDialog, {
		type EventPreferenceChanges
	} from '$lib/components/calendar/EventEditorDialog.svelte';
	import CalendarComparison from '$lib/components/friends/CalendarComparison.svelte';
	import ParticipantPicker from '$lib/components/friends/ParticipantPicker.svelte';
	import SavedMeetings from '$lib/components/friends/SavedMeetings.svelte';
	import Help from '$lib/components/settings/Help.svelte';
	import Settings from '$lib/components/settings/Settings.svelte';
	import WeekNavigation from '$lib/components/ui/WeekNavigation.svelte';

	const ui = getPanelUi();
	const dates = $derived(weekDates(ui.week));
	const participants = $derived(ui.people.filter((person) => ui.selected.includes(person.id)));
	$effect(() => {
		ui.termOptions = displayTerms;
	});
	let responseData: ResponseData | undefined = $derived(
		$storedProcessedData.find((d) => String(d.termId) === ui.term)?.responseData
	);
	let jwt_token: string | undefined = $state(undefined);
	let processedData: Course[] | undefined = $derived(responseData?.classes);
	let savedData = $state.raw<SavedMeetingsResponse>({ meetings: [], occurrences: [] });
	let selectedSavedOccurrence = $state('');
	const comparisonMessage = $derived(
		ui.hasSelectedFriends
			? undefined
			: ui.friendsLoading
				? 'Loading friends…'
				: ui.friendsError || 'Select some friends to compare calendars.'
	);
	let terms = $state<TermResponse | undefined>(undefined);
	const termDates = $derived.by(() => {
		const meetings = (processedData ?? []).flatMap((course) => course.meeting_times ?? []);
		const starts = meetings
			.map((meeting) => meeting.start_date?.slice(0, 10))
			.filter(Boolean)
			.sort();
		const ends = meetings
			.map((meeting) => meeting.end_date?.slice(0, 10))
			.filter(Boolean)
			.sort();
		return { start: starts[0], end: ends.at(-1) };
	});
	const historicSchedule = $derived.by(() => {
		const currentTerm = terms?.current_term?.id ?? ui.currentTerm;
		return Boolean(
			ui.term && currentTerm != null
				? Number(ui.term) < Number(currentTerm)
				: !ui.comparison && termDates.end && termDates.end < todayDate()
		);
	});
	const calendarCourses = $derived([
		...(processedData ?? []),
		...(historicSchedule ? [] : savedMeetingCourses(savedData, dates))
	]);
	$effect(() => {
		if (historicSchedule && (!ui.comparison || displayTerms.some((term) => term.id === ui.term))) {
			ui.comparison = false;
			ui.highlightedSlot = undefined;
		}
		if (!ui.term || (!processedData && !ui.comparison) || ui.datedTerm === ui.term) return;
		ui.datedTerm = ui.term;
		const start = ui.comparison ? ui.termBounds[ui.term]?.start : termDates.start;
		ui.week = weekDates(
			ui.highlightedSlot?.date ??
				(start && start > todayDate() ? start : ui.comparison ? ui.week : todayDate())
		)[0];
	});
	let activeCourse: Course | undefined = $state(undefined);
	let activeMeeting: MeetingTime | undefined = $state(undefined);
	let currentEventPrefs = $state<GetPreferencesResponse | undefined>(undefined);
	let loading = $state(false);
	let refreshing = $state(false);
	// The router destroys this page when the user opens the friends page. The
	// session keeps what this page already loaded, so coming back sends no requests.
	const session = getPanelSession();
	// Terms whose preference refresh already ran on this page. A failed refresh
	// is not recorded in the session, and this set stops an endless retry.
	const refreshTried = new SvelteSet<string>();
	let showHistoricTerms = $derived($storedUserSettings?.show_historic_terms ?? false);
	let displayTerms = $derived(
		(() => {
			if (!terms) return [];
			const currentTermId = terms?.current_term?.id ?? ui.currentTerm;
			const fromEnrolled = $enrolledTerms.filter((t) => t?.id);
			const fromApi = [
				terms?.current_term && { id: String(terms.current_term.id), name: terms.current_term.name },
				terms?.next_term && { id: String(terms.next_term.id), name: terms.next_term.name }
			].filter((t): t is { id: string; name: string } => !!t);
			const base = fromEnrolled.length > 0 ? [...fromEnrolled] : fromApi.slice(0, 1);
			const planningTermId =
				ui.currentTerm ??
				(terms?.current_term?.id != null ? String(terms.current_term.id) : undefined);
			const planningTerm = fromApi.find((term) => term.id === planningTermId);
			if (ui.comparison && planningTerm && !base.some((term) => term.id === planningTerm.id)) {
				base.push(planningTerm);
			}
			if (!showHistoricTerms && currentTermId != null) {
				return base.filter((t) => parseInt(t.id) >= Number(currentTermId));
			}
			return base;
		})()
	);
	let preferredDisplayTerm = $derived.by(() => {
		if (displayTerms.length === 0) return undefined;
		const currentId = terms?.current_term?.id != null ? String(terms.current_term.id) : undefined;
		const current = currentId ? displayTerms.find((t) => t.id === currentId) : undefined;
		if (current) return current;
		return displayTerms.reduce((a, b) => (parseInt(a.id, 10) >= parseInt(b.id, 10) ? a : b));
	});
	let militaryTime = $derived($storedUserSettings?.military_time ?? true);
	let lectureColor = $derived($storedUserSettings?.default_color_lecture ?? '#039be5');
	let labColor = $derived($storedUserSettings?.default_color_lab ?? '#f6bf26');
	let advancedEditing = $derived($storedUserSettings?.advanced_editing ?? false);
	let isOtherCalendar = $state(
		browser ? localStorage.getItem('isOtherCalendar') === 'true' : false
	);

	const calendarStartHour = $derived(startHourFor(calendarCourses));
	const stackedMeetings = $derived(
		stackMeetings(calendarCourses, {
			dates,
			startHour: calendarStartHour,
			historic: historicSchedule,
			labColor,
			lectureColor
		})
	);
	const earliestClassOffsetRem = $derived(earliestOffset(stackedMeetings));

	function closeEditor() {
		activeCourse = undefined;
		activeMeeting = undefined;
		currentEventPrefs = undefined;
	}

	function onWindowKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && activeCourse) closeEditor();
	}

	onMount(() => {
		if (browser && typeof window !== 'undefined') {
			window.addEventListener('keydown', onWindowKeyDown, true);
		}
	});

	onDestroy(() => {
		if (browser && typeof window !== 'undefined') {
			window.removeEventListener('keydown', onWindowKeyDown, true);
		}
	});

	function selectCalendarEvent(item: { course: Course; meeting: MeetingTime }) {
		const occurrence = savedData.occurrences.find(
			(occurrence) => occurrence.id === item.meeting.id
		);
		if (occurrence) {
			selectedSavedOccurrence = occurrence.id;
			return;
		}
		activeCourse = item.course;
		activeMeeting = item.meeting;
		getEventPerfs(item.meeting.id);
	}

	function copyLink() {
		return copyIcsUrl(responseData?.ics_url || $storedIcsUrl);
	}

	async function ensureProcessedForTerm(termId: string | undefined) {
		if (!termId || loading) return;
		let version = session.ownScheduleVersions[termId] ?? 0;
		const fresh = () =>
			session.active &&
			ui.term === termId &&
			(session.ownScheduleVersions[termId] ?? 0) === version;
		try {
			loading = true;
			if (session.termProcessing.pending.has(termId)) await session.termProcessing.wait(termId);
			if (!session.active || ui.term !== termId) return;
			version = session.ownScheduleVersions[termId] ?? 0;
			let status = await API.userIsProcessed(termId);
			if (status.status === 'pending' || status.status === 'processing') {
				await session.termProcessing.wait(termId, status);
				status = await API.userIsProcessed(termId);
			}
			if (!fresh()) return;
			if (status?.processed) {
				const events = await session.loadProcessedEvents(termId);
				if (!fresh()) return;
				let ics = $storedIcsUrl;
				if (!ics) {
					const icsResponse = await API.getIcsUrl();
					if (!fresh()) return;
					ics = icsResponse.ics_url;
					if (ics) {
						storedIcsUrl.set(ics);
					}
				}
				upsertProcessedTerm(String(termId), () => ({
					ics_url: ics ?? '',
					classes: events.classes
				}));
			} else if (!ui.comparison) {
				loading = false;
				await runScrapeAndProcess(termId);
			}
		} catch (e) {
			console.error('Failed to ensure processed for term:', e);
			if (fresh()) snackbar('Failed to fetch calendar: ' + e, undefined, true);
		} finally {
			if (ui.term !== termId) session.attemptedTerms.delete(termId);
			loading = false;
		}
	}

	async function getEventPerfs(eventId: number | string) {
		const term = ui.term;
		if (!term) return;
		const snapshot = session.preferences.snapshot(term);
		currentEventPrefs = undefined;
		try {
			const data =
				session.preferences.get(term, eventId) ?? (await API.getMeetingTimePreference(eventId));
			if (
				!session.preferences.isCurrent(term, snapshot) ||
				ui.term !== term ||
				String(activeMeeting?.id) !== String(eventId)
			)
				return;
			currentEventPrefs = data;
		} catch {
			if (session.active && ui.term === term && String(activeMeeting?.id) === String(eventId)) {
				snackbar('Could not load event preferences. Please try again.', undefined, true);
			}
		}
	}

	async function syncProcessedEventsForTerm(termId: string) {
		const version = session.ownScheduleVersions[termId] ?? 0;
		try {
			const events = await session.loadProcessedEvents(termId);
			if (
				!session.active ||
				ui.term !== termId ||
				(session.ownScheduleVersions[termId] ?? 0) !== version
			)
				return;
			if (!Array.isArray(events?.classes)) return;
			upsertProcessedTerm(String(termId), (existing) => ({
				ics_url: existing?.ics_url || $storedIcsUrl || '',
				classes: mergeProcessedClasses(existing?.classes, events.classes)
			}));
		} catch (e) {
			console.error('Failed to sync processed events:', e);
		} finally {
			if (ui.term !== termId) session.attemptedTerms.delete(termId);
		}
	}

	// Returns false when no preferences loaded for a term that has meeting times.
	async function refreshAllEventPrefsForCurrentTerm(): Promise<boolean> {
		if (!ui.term || !processedData) return false;
		const term = ui.term;
		const scheduleVersion = session.ownScheduleVersions[term] ?? 0;
		const ids = Array.from(
			new Set(
				processedData.flatMap((c) =>
					(c.meeting_times ?? []).filter((mt) => mt?.id != null).map((mt) => mt.id)
				)
			)
		);
		try {
			const map = await session.preferences.loadTerm(term, () => fetchPreferences(ids));
			if (
				!map ||
				!session.preferences.isLoaded(term, map) ||
				(session.ownScheduleVersions[term] ?? 0) !== scheduleVersion
			)
				return false;
			applyPreferences(term, map);
			return true;
		} catch {
			return false;
		}
	}

	onMount(() =>
		session.preferences.subscribe(() => {
			refreshTried.clear();
			if (ui.term && processedData) {
				const term = ui.term;
				refreshTried.add(term);
				void refreshAllEventPrefsForCurrentTerm().then((ok) => {
					if (ok) session.refreshedTerms.add(term);
					else refreshTried.delete(term);
				});
			}
		})
	);

	async function runScrapeAndProcess(termId: string | undefined) {
		if (loading) return;
		if (termId && session.termProcessing.pending.has(termId)) {
			await ensureProcessedForTerm(termId);
			return;
		}
		let expectedTerm = termId;
		let version = expectedTerm ? (session.ownScheduleVersions[expectedTerm] ?? 0) : 0;
		const fresh = () =>
			session.active &&
			(!expectedTerm ||
				(ui.term === expectedTerm && (session.ownScheduleVersions[expectedTerm] ?? 0) === version));
		try {
			loading = true;
			const res = await importSchedule(session, termId);
			if (!fresh()) return;
			if (!res?.ics_url) {
				throw new Error('No ICS URL in response');
			}
			// Use the term code Banner returned; fall back to what we requested.
			const actualTermId = res.termId || termId;
			if (!actualTermId) {
				throw new Error('Could not determine which term to load');
			}
			if (ui.comparison && actualTermId !== termId) return;
			if (actualTermId !== termId) {
				ui.term = actualTermId;
			}
			expectedTerm = actualTermId;
			session.invalidateOwnSchedule(actualTermId);
			ui.busyActions?.invalidate('you');
			version = session.ownScheduleVersions[actualTermId];
			const events = await session.loadProcessedEvents(actualTermId);
			if (!fresh()) return;
			storedIcsUrl.set(res.ics_url);
			upsertProcessedTerm(String(actualTermId), () => ({
				ics_url: res.ics_url,
				classes: events.classes
			}));
			track('schedule_import_succeeded');
			ui.scheduleStatus[actualTermId] ??= {};
			ui.scheduleStatus[actualTermId].you = 'loaded';
			delete ui.scheduleErrors[actualTermId]?.you;
			snackbar('Calendar fetched successfully!', undefined, true);
		} catch (e) {
			console.error('Failed to scrape and process:', e);
			if (!fresh()) return;
			track('schedule_import_failed');
			snackbar('Failed to fetch calendar: ' + e, undefined, true);
		} finally {
			loading = false;
		}
	}

	async function refreshSchedule(termId: string | undefined) {
		if (!termId || refreshing || loading) return;
		if (session.termProcessing.pending.has(termId)) {
			await ensureProcessedForTerm(termId);
			return;
		}
		let version = session.ownScheduleVersions[termId] ?? 0;
		const fresh = () =>
			session.active &&
			ui.term === termId &&
			(session.ownScheduleVersions[termId] ?? 0) === version;
		try {
			refreshing = true;

			const scraped = await fetchRegistrationEvents();
			if (!scraped) {
				snackbar('Failed to open LeopardWeb tab', undefined, true);
				return;
			}
			const registrationData = scraped.events;

			if (!Array.isArray(registrationData)) {
				throw new Error('Unexpected response from LeopardWeb');
			}

			// Filter to only the current term's events before reprocessing
			const termFiltered = registrationData.filter((e: any) => String(e.term) === String(termId));
			const eventsToReprocess = termFiltered.length > 0 ? termFiltered : registrationData;

			// Call the reprocess endpoint
			const response = await API.reprocessCourses(eventsToReprocess);
			if (!fresh()) return;

			if (response.ics_url) {
				storedIcsUrl.set(response.ics_url);
			}

			const actualRefreshTermId = String(eventsToReprocess[0]?.term ?? termId);

			session.invalidateOwnSchedule(actualRefreshTermId);
			ui.busyActions?.invalidate('you');
			version = session.ownScheduleVersions[termId] ?? 0;
			const events = await session.loadProcessedEvents(actualRefreshTermId);
			if (!fresh()) return;
			upsertProcessedTerm(String(actualRefreshTermId), (existing) => ({
				ics_url: response.ics_url || $storedIcsUrl || '',
				classes: mergeProcessedClasses(existing?.classes, events.classes)
			}));

			// Show results
			ui.scheduleStatus[actualRefreshTermId] ??= {};
			ui.scheduleStatus[actualRefreshTermId].you = 'loaded';
			delete ui.scheduleErrors[actualRefreshTermId]?.you;

			if (response.removed_enrollments > 0) {
				const courseNames = response.removed_courses.map((c) => c.title).join(', ');
				snackbar(
					`Schedule refreshed. Removed ${response.removed_enrollments} class${response.removed_enrollments > 1 ? 'es' : ''}: ${courseNames}`,
					undefined,
					true
				);
			} else {
				snackbar('Schedule refreshed.', undefined, true);
			}

			// Refresh event preferences after reprocessing
			await refreshAllEventPrefsForCurrentTerm();
		} catch (e) {
			console.error('Failed to refresh schedule:', e);
			if (!fresh()) return;
			snackbar(
				'Failed to refresh schedule: ' + (e instanceof Error ? e.message : String(e)),
				undefined,
				true
			);
		} finally {
			refreshing = false;
		}
	}

	async function saveEventPreferences(event_preference: EventPreferenceChanges) {
		if (Object.keys(event_preference).length === 0) {
			closeEditor();
			snackbar('No changes made!', undefined, true);
			return;
		}

		const payload = { event_preference };
		const meetingIdForUpdate = activeMeeting?.id;
		const termForUpdate = ui.term;
		if (!meetingIdForUpdate || !termForUpdate) {
			snackbar('No meeting selected', undefined, true);
			return;
		}
		const preferenceSnapshot = session.preferences.snapshot(termForUpdate);
		try {
			const saved = await API.updateMeetingTimePreference(meetingIdForUpdate, payload);
			if (!session.active) return;
			if (session.preferences.isCurrent(termForUpdate, preferenceSnapshot)) {
				session.preferences.update(termForUpdate, meetingIdForUpdate, saved);
				applyPreferences(termForUpdate, new Map([[String(meetingIdForUpdate), saved]]));
			}
			if (ui.term !== termForUpdate || String(activeMeeting?.id) !== String(meetingIdForUpdate))
				return;
			snackbar('Event preferences saved successfully!', undefined, true);
			closeEditor();
		} catch (e) {
			closeEditor();
			snackbar(
				'Failed to save event preferences: ' + (e instanceof Error ? e.message : String(e)),
				undefined,
				true
			);
		}
	}

	// Check if returning to settings after environment switch (before render)
	let shouldReturnToSettings = browser && sessionStorage.getItem('returnToSettings') === 'true';
	let shouldClearData = browser && sessionStorage.getItem('clearCalendarData') === 'true';
	let initialView = browser ? page.url.searchParams.get('view') : null;
	let tab = $state(
		shouldReturnToSettings || initialView === 'settings'
			? 'settings'
			: initialView === 'help'
				? 'help'
				: 'a'
	);

	$effect(() => {
		const view = page.url.searchParams.get('view');
		tab = view === 'settings' || view === 'help' ? view : 'a';
	});

	// Clear data immediately if switching environments (before render)
	if (shouldClearData && browser) {
		sessionStorage.removeItem('returnToSettings');
		sessionStorage.removeItem('clearCalendarData');
		// Clear stores immediately to prevent old data from showing
		localStorage.removeItem('processedData');
		localStorage.removeItem('userSettings');
		localStorage.removeItem('icsUrl');
	}

	function clearEnvironmentData() {
		storedProcessedData.set([]);
		storedUserSettings.set(undefined);
		storedIcsUrl.set(undefined);
	}

	// Loads the terms and the user settings. Neither depends on the other, so
	// they go out together. The settings load once per session. The terms come
	// from the session, which shares one request with the friends page.
	async function loadTermsAndSettings() {
		const settingsRequest = session.calendarLoaded ? undefined : API.userSettings();
		// Keep a failed settings request from being reported as unhandled while
		// the terms request is still open. It still throws at its await below.
		settingsRequest?.catch(() => undefined);

		try {
			terms = await session.loadTerms();
		} catch (e) {
			console.error('Failed to load terms:', e);
		}

		if (!settingsRequest) return;
		try {
			const settings = await settingsRequest;
			// A reply for an ended session must not write into the new one.
			if (!session.active) return;
			storedUserSettings.set(settings);
			if (settings.enrolled_terms?.length && $enrolledTerms.length === 0) {
				enrolledTerms.set(settings.enrolled_terms);
			}
			session.calendarLoaded = true;
		} catch (e) {
			// The auth code already sent the user to sign in.
			if (!(e instanceof AuthError)) {
				console.error('Failed to load user settings:', e);
			}
		}
	}

	onMount(async () => {
		if (shouldReturnToSettings) {
			sessionStorage.removeItem('returnToSettings');
			let destination: string = resolve('/calendar');
			destination += '?view=settings';
			void goto(destination, { replaceState: true });
		}
		checkBetaAccess();
		jwt_token = await getUsableJwt();
		if (!jwt_token) {
			// No JWT token for current environment, redirect to welcome page
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto('/');
			return;
		}

		// IMPORTANT: Clear data FIRST before fetching anything for environment switches
		if (shouldClearData) {
			clearEnvironmentData();
		}

		// The (panel) layout handles environment changes. It starts a new
		// session and mounts this page again.
		await loadTermsAndSettings();
	});

	$effect(() => {
		if (!terms) return;
		if (!ui.term) {
			if (preferredDisplayTerm?.id) {
				ui.term = preferredDisplayTerm.id;
			} else if (terms) {
				const initial = terms?.current_term?.id ?? terms?.next_term?.id;
				ui.term = initial != null ? String(initial) : undefined;
			}
		} else if (displayTerms.length > 0 && !displayTerms.some((t) => t?.id === ui.term)) {
			if (preferredDisplayTerm?.id) ui.term = preferredDisplayTerm.id;
		}
	});

	$effect(() => {
		if (!ui.comparison && ui.term && !loading && !session.attemptedTerms.has(ui.term)) {
			session.attemptedTerms.add(ui.term);
			if ($storedProcessedData.some((d) => String(d.termId) === ui.term)) {
				syncProcessedEventsForTerm(ui.term);
			} else {
				ensureProcessedForTerm(ui.term);
			}
		}
	});

	$effect(() => {
		if (
			processedData &&
			ui.term &&
			!session.refreshedTerms.has(ui.term) &&
			!refreshTried.has(ui.term)
		) {
			const term = ui.term;
			refreshTried.add(term);
			// Record the term only after a refresh that worked, so the next
			// visit tries a failed one again.
			refreshAllEventPrefsForCurrentTerm().then((ok) => {
				if (ok) session.refreshedTerms.add(term);
				else refreshTried.delete(term);
			});
		}
	});

	$effect(() => {
		ui.calendarActions = processedData
			? {
					refresh: () => {
						void refreshSchedule(ui.term);
					},
					copyLink: isOtherCalendar ? copyLink : undefined,
					refreshing,
					loading
				}
			: undefined;
	});
	onDestroy(() => {
		ui.calendarActions = undefined;
	});
</script>

<div class="min-w-0 gap-3 @container box-border flex h-full w-full flex-col">
	{#if !ui.comparison && !processedData && tab === 'a'}
		<div
			class="gap-6 p-6 bg-surface-container rounded-2xl shadow-md max-w-lg mx-auto flex w-full flex-col items-center"
		>
			<div class="gap-1 flex w-full flex-col items-center">
				<h1 class="text-xl font-bold text-primary mb-1 text-center">Get Your Calendar</h1>
				<p class="text-md text-secondary text-center">
					Click the button below to fetch your classes and generate your calendar. If you've linked
					your Google Calendar, your events will be added there as well!
					<br /><br />
					If clicking the button below doesn't work, the server may be down. Please check the
					<a
						class="text-primary hover:text-primary-container underline"
						href="https://stats.uptimerobot.com/QS76oPqfzz"
						target="_blank">status page</a
					>
					for updates. If the issue persists, please submit a bug report on
					<a
						class="text-primary hover:text-primary-container underline"
						href="https://github.com/WITCodingClub/calendar-backend/issues"
						target="_blank">GitHub</a
					>.
				</p>
			</div>
			<div class="peak gap-2 flex flex-col items-center">
				{#if loading}
					<LoadingIndicator size={44} />
				{:else}
					<Button variant="filled" square onclick={() => runScrapeAndProcess(ui.term)}>
						<span class="gap-2 flex flex-row items-center">
							<svg
								class="w-5 h-5 mr-1"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								viewBox="0 0 24 24"
								><rect
									x="4"
									y="4"
									width="16"
									height="16"
									rx="2.5"
									stroke="currentColor"
									fill="#FFF3"
								/><path
									d="M8 2v4M16 2v4M3 10h18"
									stroke="currentColor"
									stroke-linecap="round"
								/><circle cx="7.5" cy="15.5" r="1.25" fill="currentColor" /><circle
									cx="12"
									cy="15.5"
									r="1.25"
									fill="currentColor"
								/><circle cx="16.5" cy="15.5" r="1.25" fill="currentColor" /></svg
							>
							Get Calendar
						</span>
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	{#if tab === 'a'}
		{#if ui.comparison}
			<div class="gap-2 flex flex-wrap items-center justify-between">
				<ParticipantPicker bind:selected={ui.selected} />
				<div class="ml-auto shrink-0">
					<Button
						variant="text"
						onclick={() => {
							ui.comparison = false;
							ui.highlightedSlot = undefined;
						}}>Exit comparison</Button
					>
				</div>
			</div>
			{#if comparisonMessage}
				<div class="gap-2 flex flex-wrap items-center justify-between" role="status">
					<p class="text-sm text-on-surface-variant">{comparisonMessage}</p>
					<Button variant="text" onclick={() => ui.friendActions?.retrySchedules()}
						>Reload schedules</Button
					>
				</div>
			{:else}
				<CalendarComparison
					{militaryTime}
					{participants}
					comparison
					date={ui.week}
					bind:week={ui.week}
					slot={ui.highlightedSlot}
					ownEvents={stackedMeetings}
					friendSchedules={ui.term ? (ui.friendSchedules[ui.term] ?? {}) : {}}
					onownselect={selectCalendarEvent}
					onedit={() => {
						ui.meetingDetails = true;
						ui.meetingEditorOpen = true;
					}}
				/>
			{/if}
		{:else}
			{#if !historicSchedule}<WeekNavigation bind:week={ui.week} />{/if}
			{#if processedData || savedData.occurrences.length}
				<CalendarGrid
					{stackedMeetings}
					dates={historicSchedule ? undefined : dates}
					startHour={calendarStartHour}
					latestHour={latestEndHour(calendarCourses)}
					{militaryTime}
					{earliestClassOffsetRem}
					onselect={selectCalendarEvent}
				/>
			{/if}
		{/if}
		{#if jwt_token}
			<SavedMeetings
				week={ui.week}
				{militaryTime}
				showList={false}
				bind:selectedOccurrence={selectedSavedOccurrence}
				ondata={(data) => (savedData = data)}
			/>
		{/if}
	{:else if tab === 'settings'}
		<Settings />
	{:else if tab === 'help'}
		<Help />
	{/if}
</div>

{#if activeCourse && activeMeeting}
	<EventEditorDialog
		course={activeCourse}
		meeting={activeMeeting}
		prefs={currentEventPrefs}
		visible={tab === 'a'}
		{advancedEditing}
		{labColor}
		{lectureColor}
		onclose={closeEditor}
		onsave={saveEventPreferences}
	/>
{/if}
