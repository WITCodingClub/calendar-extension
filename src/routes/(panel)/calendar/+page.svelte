<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		processedData as storedProcessedData,
		icsUrl as storedIcsUrl,
		enrolledTerms
	} from '$lib/store';
	import type {
		Course,
		MeetingTime,
		ResponseData,
		TermResponse,
		DayItem,
		GetPreferencesResponse,
		TemplateVariables,
		ResolvedData,
		NotificationSetting,
		ReminderSettings,
		NotificationMethod
	} from '$lib/types';
	import {
		Button,
		LoadingIndicator,
		SelectOutlined,
		TextFieldOutlined,
		TextFieldOutlinedMultiline,
		Chip
	} from 'm3-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import CalendarGrid from '$lib/components/CalendarGrid.svelte';
	import { fade, scale } from 'svelte/transition';
	import { API } from '$lib/api';
	import { AuthError, getUsableJwt } from '$lib/auth';
	import Settings from '$lib/components/Settings.svelte';
	import Help from '$lib/components/Help.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';
	import WeekNavigation from '$lib/components/WeekNavigation.svelte';
	import CalendarComparison from '$lib/components/friends/CalendarComparison.svelte';
	import SavedMeetings from '$lib/components/friends/SavedMeetings.svelte';
	import { savedMeetingCourses, type SavedMeetingsResponse } from '$lib/savedMeetings';
	import ParticipantPicker from '$lib/components/friends/ParticipantPicker.svelte';
	import { getPanelUi } from '$lib/panelUi.svelte';
	import { todayDate, weekDates } from '$lib/calendarDates';
	import { userSettings as storedUserSettings } from '$lib/store';
	import { browser } from '$app/environment';
	import { snackbar } from 'm3-svelte';
	import { createWitTab } from '$lib/witTab';
	import { track } from '$lib/telemetry';
	import { getPanelSession } from '$lib/panelSession';

	type RegistrationsLookupResult =
		| { error: string }
		| {
				termOptions: Array<{ id: string; name: string }>;
				registrations: unknown[];
				usedTermId: string;
		  };
	type RegistrationEventsLookupResult =
		| { error: string }
		| { termOptions: Array<{ id: string; name: string }>; events: unknown };

	const ui = getPanelUi();
	let selected = $derived(ui.term);
	const dates = $derived(weekDates(ui.week));
	const participants = $derived(ui.people.filter((person) => ui.selected.includes(person.id)));
	$effect(() => {
		ui.termOptions = displayTerms;
	});
	let responseData: ResponseData | undefined = $derived(
		$storedProcessedData.find((d) => String(d.termId) === selected)?.responseData
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
			selected && currentTerm != null
				? Number(selected) < Number(currentTerm)
				: !ui.comparison && termDates.end && termDates.end < todayDate()
		);
	});
	const calendarCourses = $derived([
		...(processedData ?? []),
		...(historicSchedule ? [] : savedMeetingCourses(savedData, dates))
	]);
	$effect(() => {
		if (historicSchedule && (!ui.comparison || displayTerms.some((term) => term.id === selected))) {
			ui.comparison = false;
			ui.highlightedSlot = undefined;
		}
		if (!selected || (!processedData && !ui.comparison) || ui.datedTerm === selected) return;
		ui.datedTerm = selected;
		const start = ui.comparison ? ui.termBounds[selected]?.start : termDates.start;
		ui.week = weekDates(
			ui.highlightedSlot?.date ??
				(start && start > todayDate() ? start : ui.comparison ? ui.week : todayDate())
		)[0];
	});
	let activeCourse: Course | undefined = $state(undefined);
	let activeMeeting: MeetingTime | undefined = $state(undefined);
	let activeDay: DayItem | undefined = $state(undefined);
	let loading = $state(false);
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

	const EVENT_HEX_TO_WITCC: Record<string, string> = {
		'#a4bdfc': '#7986cb',
		'#7ae7bf': '#33b679',
		'#dbadff': '#8e24aa',
		'#ff887c': '#e67c73',
		'#fbd75b': '#f6bf26',
		'#ffb878': '#f4511e',
		'#46d6db': '#039be5',
		'#e1e1e1': '#616161',
		'#5484ed': '#3f51b5',
		'#51b749': '#0b8043',
		'#dc2127': '#d50000'
	};
	const COLOR_ID_TO_WITCC: Record<string, string> = {
		'1': '#7986cb',
		'2': '#33b679',
		'3': '#8e24aa',
		'4': '#e67c73',
		'5': '#f6bf26',
		'6': '#f4511e',
		'7': '#039be5',
		'8': '#616161',
		'9': '#3f51b5',
		'10': '#0b8043',
		'11': '#d50000'
	};
	function toDropdownColor(
		color: string | number | null | undefined,
		fallback = '#d50000'
	): string {
		if (color == null || color === '') return fallback;
		const normalized = String(color).toLowerCase();
		return (
			EVENT_HEX_TO_WITCC[normalized] ??
			COLOR_ID_TO_WITCC[normalized] ??
			(normalized.startsWith('#') ? normalized : fallback)
		);
	}
	function defaultEventColor(): string {
		const isLab = (activeCourse?.schedule_type ?? '').toLowerCase() === 'laboratory';
		return toDropdownColor(isLab ? labColor : lectureColor, isLab ? '#f6bf26' : '#039be5');
	}
	function resolvedEventColor(): string {
		return toDropdownColor(resolved?.color_id || activeMeeting?.color, defaultEventColor());
	}
	let currentEventPrefs = $state<GetPreferencesResponse | undefined>(undefined);
	let templates: TemplateVariables | undefined = $derived(currentEventPrefs?.templates);
	let resolved: ResolvedData | undefined = $derived(currentEventPrefs?.resolved);
	let editMode = $state(false);
	let notificationsDisabled = $state(false);

	let titleTemplates = [
		"{% if schedule_type == 'Laboratory' %}{{title | remove: '- Lab'}} - {{schedule_type_short}}{% else %}{{title}}{% endif %}",
		"{% if schedule_type == 'Laboratory' %}{{course_code}}{% else %}{{title}} - {{schedule_type_short}}{% endif %}"
	];
	let descriptionTemplates = [
		'{{faculty}}\n{{faculty_email}}',
		'{{faculty}}\n{{faculty_email}}\n{{course_code}} {{course_number}}',
		'{{term}} - {{schedule_type}}'
	];
	let locationTemplates = ['{{building}} - {{room}}', '{{building}} {{room}}'];

	function parseTemplate(t: string): string[] {
		const evalCond = (cond: string): boolean => {
			const m = cond.match(/^\s*([a-zA-Z0-9_]+)\s*(==|!=)\s*(["'])(.*?)\3\s*$/);
			if (!m) return false;
			const left = m[1] as keyof TemplateVariables;
			const op = m[2];
			const right = m[4];
			const leftVal = String(templates?.[left] ?? '');
			return op === '=='
				? leftVal.toLowerCase() === right.toLowerCase()
				: leftVal.toLowerCase() !== right.toLowerCase();
		};
		let s = t;
		while (true) {
			const openRe = /\{%\s*if\s+([\s\S]+?)\s*%\}/g;
			const openMatch = openRe.exec(s);
			if (!openMatch) break;
			const start = openMatch.index;
			const afterOpen = openMatch.index + openMatch[0].length;
			const endifRe = /\{%\s*endif\s*%\}/g;
			endifRe.lastIndex = afterOpen;
			const endifMatch = endifRe.exec(s);
			if (!endifMatch) break;
			const elseRe = /\{%\s*else\s*%\}/g;
			elseRe.lastIndex = afterOpen;
			const elseMatch = elseRe.exec(s);
			const hasElse = !!elseMatch && elseMatch.index < endifMatch.index;
			const trueBlockEnd = hasElse ? elseMatch!.index : endifMatch.index;
			const trueBlock = s.slice(afterOpen, trueBlockEnd);
			const falseBlock = hasElse
				? s.slice(elseMatch!.index + elseMatch![0].length, endifMatch.index)
				: '';
			const chosen = evalCond(openMatch[1]) ? trueBlock : falseBlock;
			s = s.slice(0, start) + chosen + s.slice(endifMatch.index + endifMatch[0].length);
		}
		const result: string[] = [];
		let lastIndex = 0;
		const regex = /\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*remove:\s*(["'])(.*?)\2)?\s*\}\}/g;
		let m: RegExpExecArray | null;
		while ((m = regex.exec(s)) !== null) {
			if (m.index > lastIndex) {
				result.push(s.slice(lastIndex, m.index));
			}
			const key = m[1] as keyof TemplateVariables;
			let value = templates?.[key] ?? '';
			if (!value && m[1] === 'schedule_type_short') {
				const st = String(templates?.schedule_type ?? '').toLowerCase();
				value =
					st === 'laboratory' ? 'Lab' : st === 'lecture' ? 'Lec' : (templates?.schedule_type ?? '');
			}
			if (m[3]) {
				value = value.replaceAll(m[3], '');
			}
			result.push(value);
			lastIndex = regex.lastIndex;
		}
		if (lastIndex < s.length) {
			result.push(s.slice(lastIndex));
		}
		return result;
	}

	function isPresetSelected(current: string, presets: string[], index: number): boolean {
		const preset = presets[index];
		if (!preset) return false;
		const effective = current || presets[0];
		if (!effective) return false;
		if (effective === preset) return true;
		return parseTemplate(effective).join('') === parseTemplate(preset).join('');
	}

	let derivedTemplates = $derived.by(() => {
		return {
			titleTemplates: titleTemplates.map(parseTemplate),
			descriptionTemplates: descriptionTemplates.map(parseTemplate),
			locationTemplates: locationTemplates.map(parseTemplate)
		};
	});

	async function checkBetaAccess() {
		const beta_access = await chrome.storage.local.get('beta_access');
		if (beta_access && (beta_access.beta_access === 'false' || beta_access.beta_access === false)) {
			goto(resolve('/beta-access-denied/'));
			return Promise.reject(new Error('Beta access denied')) as never;
		}
	}

	// Pointer/drag guard: prevent scrim clicks produced by dragging text
	// that started inside the dialog from closing the modal when the user
	// releases the pointer outside the dialog.
	let modalEl: HTMLElement | null = $state(null);
	let lastPointerDownInside = false;
	let lastPointerDownInsideSnapshot = false;
	let lastPointerUpWasOutside = false;

	function onPointerDownInside() {
		lastPointerDownInside = true;
	}

	function onWindowPointerUp(e: PointerEvent) {
		// snapshot whether the pointerdown started inside the modal
		lastPointerDownInsideSnapshot = lastPointerDownInside;
		// was the pointerup target outside the modal?
		lastPointerUpWasOutside = !(modalEl && modalEl.contains(e.target as Node));
		// reset running flag
		lastPointerDownInside = false;
	}

	function onWindowKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape' && activeCourse) {
			activeCourse = undefined;
			activeMeeting = undefined;
			activeDay = undefined;
			notifications = [];
			courseColor = '#d50000';
			currentEventPrefs = undefined;
			editTitle = '';
			editDescription = '';
			editLocation = '';
			editTitleManual = '';
			editDescriptionManual = '';
			editLocationManual = '';
			editMode = false;
		}
	}

	onMount(() => {
		if (browser && typeof window !== 'undefined') {
			window.addEventListener('pointerup', onWindowPointerUp, true);
			window.addEventListener('keydown', onWindowKeyDown, true);
		}
	});

	onDestroy(() => {
		if (browser && typeof window !== 'undefined') {
			window.removeEventListener('pointerup', onWindowPointerUp, true);
			window.removeEventListener('keydown', onWindowKeyDown, true);
		}
	});

	function getTextColor(bgColor: string): string {
		const hex = bgColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}

	const dayOrder: DayItem[] = [
		{ key: 'monday', label: 'Monday', abbr: 'M', order: 0 },
		{ key: 'tuesday', label: 'Tuesday', abbr: 'T', order: 1 },
		{ key: 'wednesday', label: 'Wednesday', abbr: 'W', order: 2 },
		{ key: 'thursday', label: 'Thursday', abbr: 'Th', order: 3 },
		{ key: 'friday', label: 'Friday', abbr: 'F', order: 4 },
		{ key: 'saturday', label: 'Saturday', abbr: 'Sa', order: 5 },
		{ key: 'sunday', label: 'Sunday', abbr: 'Su', order: 6 }
	];

	type PositionedMeeting = {
		course: Course;
		meeting: MeetingTime;
		startOffset: number;
		width: number;
		startTotal: number;
		endTotal: number;
		bgColor: string;
		textColor: string;
		stackIndex: number;
		overlapCount: number;
	};

	const calendarStartHour = $derived(
		Math.min(
			8,
			...calendarCourses.flatMap((course) =>
				course.meeting_times.map((meeting) => Number(meeting.begin_time.split(':')[0]))
			)
		)
	);
	let stackedMeetings = $derived.by(() => {
		const byDay: Record<string, PositionedMeeting[]> = {};
		const maxStacksByDay: Record<string, number> = {};
		for (const { key } of dayOrder) {
			byDay[key] = [];
			maxStacksByDay[key] = 1;
		}
		for (const course of calendarCourses) {
			if (!course) continue;
			const isLab = (course.schedule_type ?? '').toLowerCase() === 'laboratory';
			const bgColorBase = isLab ? labColor : lectureColor;
			for (const meeting of course.meeting_times ?? []) {
				if (!meeting) continue;
				for (const { key, order } of dayOrder) {
					if (!meeting[key as keyof MeetingTime]) continue;
					const date = dates[order];
					if (
						!historicSchedule &&
						date &&
						((meeting.start_date && date < meeting.start_date.slice(0, 10)) ||
							(meeting.end_date && date > meeting.end_date.slice(0, 10)))
					)
						continue;
					const startHour = parseInt(meeting.begin_time.split(':')[0]);
					const startMin = parseInt(meeting.begin_time.split(':')[1]);
					const endHour = parseInt(meeting.end_time.split(':')[0]);
					const endMin = parseInt(meeting.end_time.split(':')[1]);
					const startTotal = startHour * 60 + startMin;
					const endTotal = endHour * 60 + endMin;
					const startOffset = (((startHour - calendarStartHour) * 60 + startMin) / 60) * 8;
					const width = ((endTotal - startTotal) / 60) * 8;
					const bgColor = meeting.color ?? bgColorBase;
					const textColor = getTextColor(bgColor);
					byDay[key].push({
						course,
						meeting,
						startOffset,
						width,
						startTotal,
						endTotal,
						bgColor,
						textColor,
						stackIndex: 0,
						overlapCount: 1
					});
				}
			}
		}
		for (const { key } of dayOrder) {
			const arr = byDay[key];
			arr.sort((a, b) =>
				a.startTotal === b.startTotal ? a.endTotal - b.endTotal : a.startTotal - b.startTotal
			);
			const stackEnds: number[] = [];
			const active: PositionedMeeting[] = [];
			for (const item of arr) {
				for (let i = active.length - 1; i >= 0; i--) {
					if (item.startTotal >= active[i].endTotal) {
						active.splice(i, 1);
					}
				}
				const currentOverlap = active.length + 1;
				for (const a of active) {
					a.overlapCount = Math.max(a.overlapCount, currentOverlap);
				}
				item.overlapCount = currentOverlap;
				let stack = stackEnds.findIndex((end) => item.startTotal >= end);
				if (stack === -1) {
					stack = stackEnds.length;
					stackEnds.push(item.endTotal);
				} else {
					stackEnds[stack] = item.endTotal;
				}
				item.stackIndex = stack;
				active.push(item);
			}
			maxStacksByDay[key] = Math.max(...arr.map((m) => m.overlapCount), 1);
		}
		return { byDay, maxStacksByDay };
	});
	function selectCalendarEvent(item: { course: Course; meeting: MeetingTime }, day: DayItem) {
		const occurrence = savedData.occurrences.find(
			(occurrence) => occurrence.id === item.meeting.id
		);
		if (occurrence) {
			selectedSavedOccurrence = occurrence.id;
			return;
		}
		activeCourse = item.course;
		activeMeeting = item.meeting;
		activeDay = day;
		getEventPerfs(item.meeting.id);
	}

	let earliestClassOffsetRem = $derived.by(() => {
		let min = Infinity;
		for (const { key } of dayOrder.slice(0, 5)) {
			for (const item of stackedMeetings.byDay?.[key] ?? []) {
				if (item.startOffset < min) min = item.startOffset;
			}
		}
		return Number.isFinite(min) ? min : 0;
	});

	function getLatestEndHour(courses: Course[]): number {
		let latestHour = 8;

		for (const course of courses) {
			for (const meeting of course.meeting_times ?? []) {
				if (!meeting?.end_time) continue;
				const endHour = parseInt(meeting.end_time.split(':')[0]);
				const endMin = parseInt(meeting.end_time.split(':')[1]);
				const roundedHour = endMin > 0 ? endHour + 1 : endHour;

				if (roundedHour > latestHour) {
					latestHour = roundedHour;
				}
			}
		}

		return latestHour;
	}

	async function copyIcsToClipboard() {
		const icsUrlToCopy = responseData?.ics_url || $storedIcsUrl;
		if (!icsUrlToCopy) {
			console.error('No ICS URL available');
			return;
		}

		try {
			await navigator.clipboard.writeText(icsUrlToCopy);
			track('calendar_link_copied');
			snackbar('ICS URL copied to clipboard!', undefined, true);
		} catch (error) {
			console.error('Failed to copy ICS URL to clipboard:', error);
			snackbar('Failed to copy ICS URL to clipboard: ' + error, undefined, true);
		}
	}

	async function fetchFromCurrentPage(
		termId?: string
	): Promise<{ ics_url: string; termId: string } | undefined> {
		let tabToUse: chrome.tabs.Tab | undefined;
		let shouldCloseTab = false;
		try {
			const targetUrl =
				'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

			const [currentTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			const isOnTargetPage = currentTab?.url === targetUrl;
			tabToUse = currentTab;
			if (!isOnTargetPage) {
				tabToUse = await createWitTab(targetUrl);
				shouldCloseTab = true;
				const openedTabId = tabToUse?.id;
				if (!openedTabId) return;

				await new Promise<void>((resolve) => {
					const listener = (tabId: number, changeInfo: { status?: string }) => {
						if (tabId === tabToUse!.id && changeInfo.status === 'complete') {
							chrome.tabs.onUpdated.removeListener(listener);
							resolve();
						}
					};
					chrome.tabs.onUpdated.addListener(listener);
				});

				await new Promise((resolve) => setTimeout(resolve, 1000));

				// If CAS redirected us to the login page the user isn't authenticated.
				const finalTab = await chrome.tabs.get(tabToUse.id!);
				if (!finalTab.url?.startsWith('https://selfservice.wit.edu/')) {
					shouldCloseTab = false;
					throw new Error('Please log in to LeopardWeb (selfservice.wit.edu) and try again.');
				}
			}

			if (!tabToUse?.id) return;

			const results = await chrome.scripting.executeScript({
				target: { tabId: tabToUse.id },
				world: 'MAIN',
				func: async (termIdArg: string): Promise<RegistrationsLookupResult> => {
					try {
						// Extract the student's enrolled terms from the page dropdown
						const select = document.querySelector<HTMLSelectElement>('#lookupFilter');
						const termOptions = select
							? Array.from(select.options).map((o) => ({ id: o.value, name: o.text.trim() }))
							: [];

						// If the requested term isn't in the enrolled list, fall back to the first enrolled term
						let actualTermId = termIdArg;
						if (termOptions.length > 0 && !termOptions.some((t) => t.id === actualTermId)) {
							actualTermId = termOptions[0].id;
						}

						// Get CSRF token for the request
						const token =
							document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content') ??
							'';

						// Fetch registrations for the (possibly corrected) term
						const r = await fetch(
							`https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/reset?term=${actualTermId}`,
							{
								credentials: 'include',
								headers: {
									Accept: 'application/json, text/javascript, */*; q=0.01',
									'X-Requested-With': 'XMLHttpRequest',
									...(token ? { 'X-Synchronizer-Token': token } : {})
								}
							}
						);
						const data = await r.json();

						return {
							termOptions,
							registrations: data?.data?.registrations ?? [],
							usedTermId: actualTermId
						};
					} catch (e) {
						return { error: e instanceof Error ? e.message : String(e) };
					}
				},
				args: [termId ?? '']
			});

			const result = results[0]?.result;
			if (!result) {
				throw new Error('Unexpected response from LeopardWeb');
			}
			if ('error' in result) {
				throw new Error(result.error);
			}

			const termOptions: Array<{ id: string; name: string }> = result.termOptions ?? [];
			const registrations: any[] = result.registrations ?? [];
			const usedTermId: string = result.usedTermId ?? String(termId);

			// Persist the authoritative enrolled terms from the Banner dropdown
			if (termOptions.length > 0) {
				enrolledTerms.set(termOptions);
				API.userSettings({ enrolled_terms: termOptions }).catch(() => {});
			}

			if (registrations.length === 0) {
				const termName = termOptions.find((t) => t.id === usedTermId)?.name ?? usedTermId;
				const available = termOptions.map((t) => t.name).join(', ');
				throw new Error(
					`You have no classes for ${termName}.` +
						(available ? ` Your schedule is available for: ${available}.` : '')
				);
			}

			// Map Banner registration records to the format the backend expects
			const coursesArray = registrations.map((reg: any) => ({
				crn: reg.courseReferenceNumber,
				term: reg.term,
				courseNumber: reg.courseNumber
			}));

			const response = await API.processCourses(coursesArray);

			if (typeof response === 'string') {
				return { ics_url: response, termId: usedTermId };
			}
			return { ...response, termId: usedTermId };
		} catch (e) {
			console.error('Failed to fetch from current page:', e);
			throw e;
		} finally {
			if (shouldCloseTab && tabToUse?.id) {
				await chrome.tabs.remove(tabToUse.id);
			}
		}
	}

	async function ensureProcessedForTerm(termId: string | undefined) {
		if (!termId || loading) return;
		const version = session.ownScheduleVersions[termId] ?? 0;
		const fresh = () =>
			session.active &&
			selected === termId &&
			(session.ownScheduleVersions[termId] ?? 0) === version;
		try {
			loading = true;
			const status = await API.userIsProcessed(termId);
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
				storedProcessedData.update((list) => {
					const tid = String(termId);
					const i = list.findIndex((x) => String(x.termId) === tid);
					const next = [...list];
					const response: ResponseData = { ics_url: ics ?? '', classes: events.classes };
					if (i >= 0) next[i] = { termId: tid, responseData: response };
					else next.push({ termId: tid, responseData: response });
					return next;
				});
			} else if (!ui.comparison) {
				loading = false;
				await runScrapeAndProcess(termId);
			}
		} catch (e) {
			console.error('Failed to ensure processed for term:', e);
			if (fresh()) snackbar('Failed to fetch calendar: ' + e, undefined, true);
		} finally {
			if (selected !== termId) session.attemptedTerms.delete(termId);
			loading = false;
		}
	}

	async function getEventPerfs(eventId: number | string) {
		const term = selected;
		if (!term) return;
		const snapshot = session.preferences.snapshot(term);
		currentEventPrefs = undefined;
		try {
			const data =
				session.preferences.get(term, eventId) ?? (await API.getMeetingTimePreference(eventId));
			if (
				!session.preferences.isCurrent(term, snapshot) ||
				selected !== term ||
				String(activeMeeting?.id) !== String(eventId)
			)
				return;
			courseColor = toDropdownColor(
				data.resolved?.color_id || activeMeeting?.color,
				defaultEventColor()
			);
			currentEventPrefs = data;
		} catch {
			if (session.active && selected === term && String(activeMeeting?.id) === String(eventId)) {
				snackbar('Could not load event preferences. Please try again.', undefined, true);
			}
		}
	}

	function mergeProcessedClasses(existing: Course[] | undefined, fresh: Course[]): Course[] {
		if (!existing?.length) return fresh;
		const overlayById = new Map(
			existing.flatMap((c) =>
				(c.meeting_times ?? [])
					.filter((mt) => mt?.id != null)
					.map(
						(mt) =>
							[String(mt.id), { color: mt.color, title_overrides: mt.title_overrides }] as const
					)
			)
		);
		return fresh.map((c) => ({
			...c,
			meeting_times: c.meeting_times.map((mt) => {
				const overlay = overlayById.get(String(mt.id));
				return overlay
					? { ...mt, color: overlay.color, title_overrides: overlay.title_overrides }
					: mt;
			})
		}));
	}

	async function syncProcessedEventsForTerm(termId: string) {
		const version = session.ownScheduleVersions[termId] ?? 0;
		try {
			const events = await session.loadProcessedEvents(termId);
			if (
				!session.active ||
				selected !== termId ||
				(session.ownScheduleVersions[termId] ?? 0) !== version
			)
				return;
			if (!Array.isArray(events?.classes)) return;
			storedProcessedData.update((list) => {
				const tid = String(termId);
				const i = list.findIndex((x) => String(x.termId) === tid);
				const next = [...list];
				const ics = (i >= 0 ? list[i].responseData.ics_url : '') || $storedIcsUrl || '';
				const existing = i >= 0 ? list[i].responseData.classes : undefined;
				const classes = mergeProcessedClasses(existing, events.classes);
				if (i >= 0) next[i] = { termId: tid, responseData: { ics_url: ics, classes } };
				else next.push({ termId: tid, responseData: { ics_url: ics, classes } });
				return next;
			});
		} catch (e) {
			console.error('Failed to sync processed events:', e);
		} finally {
			if (selected !== termId) session.attemptedTerms.delete(termId);
		}
	}

	const PREFERENCES_BATCH_SIZE = 200;

	// Asks for the preferences of every meeting time in one request per 200 ids,
	// instead of one request per meeting time. If the backend has no batch
	// endpoint yet, it asks for each id on its own, as before.
	async function fetchPreferencesFor(ids: Array<number | string>): Promise<{
		preferences: Map<number | string, GetPreferencesResponse>;
		version?: string;
	}> {
		const map = new SvelteMap<number | string, GetPreferencesResponse>();
		const chunks: Array<Array<number | string>> = [];
		for (let i = 0; i < ids.length; i += PREFERENCES_BATCH_SIZE) {
			chunks.push(ids.slice(i, i + PREFERENCES_BATCH_SIZE));
		}

		const versions = await Promise.all(
			chunks.map(async (chunk) => {
				const batch = await API.getMeetingTimePreferences(chunk);
				if (batch) {
					for (const id of chunk) {
						const data = batch.preferences[String(id)];
						if (data) map.set(id, data);
					}
					return batch.version;
				}

				await Promise.all(
					chunk.map(async (id) => {
						try {
							const data: GetPreferencesResponse = await API.getMeetingTimePreference(id);
							if (data) map.set(id, data);
						} catch {
							// Skip this meeting time, as the page did before.
						}
					})
				);
			})
		);

		const version = versions[0];
		return {
			preferences: map,
			version: versions.every((value) => value === version) ? version : undefined
		};
	}

	// Returns false when no preferences loaded for a term that has meeting times.
	async function refreshAllEventPrefsForCurrentTerm(): Promise<boolean> {
		if (!selected || !processedData) return false;
		const term = selected;
		const scheduleVersion = session.ownScheduleVersions[term] ?? 0;
		const ids = Array.from(
			new Set(
				processedData.flatMap((c) =>
					(c.meeting_times ?? []).filter((mt) => mt?.id != null).map((mt) => mt.id)
				)
			)
		);
		try {
			const map = await session.preferences.loadTerm(term, () => fetchPreferencesFor(ids));
			if (
				!map ||
				!session.preferences.isLoaded(term, map) ||
				(session.ownScheduleVersions[term] ?? 0) !== scheduleVersion
			)
				return false;
			applyPreferencesForTerm(term, map);
			return true;
		} catch {
			return false;
		}
	}

	function applyPreferencesForTerm(term: string, map: Map<string, GetPreferencesResponse>) {
		const dayKeys: DayItem['key'][] = [
			'monday',
			'tuesday',
			'wednesday',
			'thursday',
			'friday',
			'saturday',
			'sunday'
		] as const;
		storedProcessedData.update((list) => {
			const tid = term;
			const i = list.findIndex((x) => String(x.termId) === tid);
			if (i < 0) return list;
			const entry = list[i];
			const classes = entry.responseData.classes.map((c) => {
				const updatedMeetingTimes = (c.meeting_times ?? []).map((mt) => {
					if (!mt) return mt;
					const pref = map.get(String(mt.id));
					if (!pref) return mt;
					const color = pref.resolved?.color_id
						? toDropdownColor(pref.resolved.color_id)
						: mt.color;
					let title_overrides = mt.title_overrides ?? {};
					const title = pref.preview?.title;
					if (title) {
						for (const k of dayKeys) {
							if (mt[k]) {
								title_overrides = { ...title_overrides, [k]: title };
							}
						}
					}
					return { ...mt, color, title_overrides };
				});
				return { ...c, meeting_times: updatedMeetingTimes };
			});
			const next = [...list];
			next[i] = {
				termId: entry.termId,
				responseData: { ics_url: entry.responseData.ics_url, classes }
			};
			return next;
		});
	}

	onMount(() =>
		session.preferences.subscribe(() => {
			refreshTried.clear();
			if (selected && processedData) {
				const term = selected;
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
		let expectedTerm = termId;
		let version = expectedTerm ? (session.ownScheduleVersions[expectedTerm] ?? 0) : 0;
		const fresh = () =>
			session.active &&
			(!expectedTerm ||
				(selected === expectedTerm &&
					(session.ownScheduleVersions[expectedTerm] ?? 0) === version));
		try {
			loading = true;
			const res = await fetchFromCurrentPage(termId);
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
			storedProcessedData.update((list) => {
				const tid = String(actualTermId);
				const i = list.findIndex((x) => String(x.termId) === tid);
				const next = [...list];
				const response: ResponseData = { ics_url: res.ics_url, classes: events.classes };
				if (i >= 0) next[i] = { termId: tid, responseData: response };
				else next.push({ termId: tid, responseData: response });
				return next;
			});
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
		let version = session.ownScheduleVersions[termId] ?? 0;
		const fresh = () =>
			session.active &&
			selected === termId &&
			(session.ownScheduleVersions[termId] ?? 0) === version;
		try {
			refreshing = true;

			// Scrape current courses from LeopardWeb
			let tabToUse: chrome.tabs.Tab | undefined;
			let shouldCloseTab = false;
			const targetUrl =
				'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

			const [currentTab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			const isOnTargetPage = currentTab.url === targetUrl;
			tabToUse = currentTab;
			if (!isOnTargetPage) {
				tabToUse = await createWitTab(targetUrl);
				shouldCloseTab = true;
				const openedTabId = tabToUse.id;
				if (!openedTabId) {
					snackbar('Failed to open LeopardWeb tab', undefined, true);
					return;
				}

				await new Promise<void>((resolve) => {
					const listener = (tabId: number, changeInfo: { status?: string }) => {
						if (tabId === openedTabId && changeInfo.status === 'complete') {
							chrome.tabs.onUpdated.removeListener(listener);
							resolve();
						}
					};
					chrome.tabs.onUpdated.addListener(listener);
				});

				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			if (!tabToUse?.id) {
				snackbar('Failed to open LeopardWeb tab', undefined, true);
				return;
			}

			const results = await chrome.scripting.executeScript({
				target: { tabId: tabToUse.id },
				world: 'MAIN',
				func: async (): Promise<RegistrationEventsLookupResult> => {
					try {
						// Extract enrolled terms from the page dropdown
						const select = document.querySelector<HTMLSelectElement>('#lookupFilter');
						const termOptions = select
							? Array.from(select.options).map((o) => ({ id: o.value, name: o.text.trim() }))
							: [];

						const r = await fetch(
							'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/classRegistration/getRegistrationEvents?termFilter=',
							{ credentials: 'include' }
						);
						const events = await r.json();
						return { termOptions, events };
					} catch (e) {
						return { error: e instanceof Error ? e.message : String(e) };
					}
				},
				args: []
			});

			if (shouldCloseTab && tabToUse?.id) {
				await chrome.tabs.remove(tabToUse.id);
			}

			const refreshResult = results[0]?.result;
			if (!refreshResult) {
				throw new Error('Unexpected response from LeopardWeb');
			}
			if ('error' in refreshResult) {
				throw new Error(refreshResult.error);
			}

			const refreshTermOptions: Array<{ id: string; name: string }> =
				refreshResult.termOptions ?? [];
			const registrationData = refreshResult.events ?? [];

			if (refreshTermOptions.length > 0) {
				enrolledTerms.set(refreshTermOptions);
				API.userSettings({ enrolled_terms: refreshTermOptions }).catch(() => {});
			}

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
			storedProcessedData.update((list) => {
				const tid = String(actualRefreshTermId);
				const i = list.findIndex((x) => String(x.termId) === tid);
				const next = [...list];
				const ics = response.ics_url || $storedIcsUrl || '';
				const existing = i >= 0 ? list[i].responseData.classes : undefined;
				const classes = mergeProcessedClasses(existing, events.classes);
				const responseData: ResponseData = { ics_url: ics, classes };
				if (i >= 0) next[i] = { termId: tid, responseData };
				else next.push({ termId: tid, responseData });
				return next;
			});

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

	async function saveEventPerfs() {
		const event_preference: Partial<{
			title_template: string;
			description_template: string;
			location_template: string;
			reminder_settings: ReminderSettings[];
			color_id: string;
			notifications_disabled: boolean;
		}> = {};

		const titleChanged = editTitle !== (resolved?.title_template ?? titleTemplates[0]);
		const titleManualChanged = editTitleManual !== currentEventPrefs?.preview?.title;
		if (titleChanged || titleManualChanged) {
			event_preference.title_template = titleChanged ? editTitle : editTitleManual;
		}

		const descriptionChanged =
			editDescription !== (resolved?.description_template ?? descriptionTemplates[0]);
		const descriptionManualChanged =
			editDescriptionManual !== currentEventPrefs?.preview?.description;
		if (descriptionChanged || descriptionManualChanged) {
			event_preference.description_template = descriptionChanged
				? editDescription
				: editDescriptionManual;
		}

		const locationChanged = editLocation !== (resolved?.location_template ?? locationTemplates[0]);
		const locationManualChanged = editLocationManual !== currentEventPrefs?.preview?.location;
		if (locationChanged || locationManualChanged) {
			event_preference.location_template = locationChanged ? editLocation : editLocationManual;
		}

		const colorChanged = courseColor !== resolvedEventColor();
		if (colorChanged) {
			event_preference.color_id = courseColor;
		}

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		//@ts-expect-error
		const convertedNotifications: ReminderSettings[] = notifications.map((n) => ({
			time: n.time.toString(),
			type: n.type,
			method: n.method
		}));

		const notificationsChanged =
			JSON.stringify(convertedNotifications) !== JSON.stringify(resolved?.reminder_settings);
		if (notificationsChanged) {
			event_preference.reminder_settings = convertedNotifications;
		}

		event_preference.notifications_disabled = notificationsDisabled;

		if (Object.keys(event_preference).length === 0) {
			activeCourse = undefined;
			activeMeeting = undefined;
			activeDay = undefined;
			currentEventPrefs = undefined;
			editTitle = '';
			editDescription = '';
			editLocation = '';
			editTitleManual = '';
			editDescriptionManual = '';
			editLocationManual = '';
			courseColor = '#d50000';
			notifications = [];
			editMode = false;
			snackbar('No changes made!', undefined, true);
			return;
		}

		const payload = { event_preference };
		const meetingIdForUpdate = activeMeeting?.id;
		const termForUpdate = selected;
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
				applyPreferencesForTerm(termForUpdate, new Map([[String(meetingIdForUpdate), saved]]));
			}
			if (selected !== termForUpdate || String(activeMeeting?.id) !== String(meetingIdForUpdate))
				return;
			snackbar('Event preferences saved successfully!', undefined, true);
			activeCourse = undefined;
			activeMeeting = undefined;
			activeDay = undefined;
			currentEventPrefs = undefined;
			editTitle = '';
			editDescription = '';
			editLocation = '';
			editTitleManual = '';
			editDescriptionManual = '';
			editLocationManual = '';
			courseColor = '#d50000';
			notifications = [];
			editMode = false;
		} catch (e) {
			activeCourse = undefined;
			activeMeeting = undefined;
			activeDay = undefined;
			currentEventPrefs = undefined;
			editTitle = '';
			editDescription = '';
			editLocation = '';
			editTitleManual = '';
			editDescriptionManual = '';
			editLocationManual = '';
			courseColor = '#d50000';
			notifications = [];
			editMode = false;
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

	let notifications = $state<NotificationSetting[]>([]);
	let courseColor = $state('#d50000');
	let editTitle = $state('');
	let editDescription = $state('');
	let editLocation = $state('');
	let editTitleManual = $state('');
	let editDescriptionManual = $state('');
	let editLocationManual = $state('');
	let refreshing = $state(false);

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
		if (!selected) {
			if (preferredDisplayTerm?.id) {
				ui.term = preferredDisplayTerm.id;
			} else if (terms) {
				const initial = terms?.current_term?.id ?? terms?.next_term?.id;
				ui.term = initial != null ? String(initial) : undefined;
			}
		} else if (displayTerms.length > 0 && !displayTerms.some((t) => t?.id === selected)) {
			if (preferredDisplayTerm?.id) ui.term = preferredDisplayTerm.id;
		}
	});

	$effect(() => {
		if (!ui.comparison && selected && !loading && !session.attemptedTerms.has(selected)) {
			session.attemptedTerms.add(selected);
			if ($storedProcessedData.some((d) => String(d.termId) === selected)) {
				syncProcessedEventsForTerm(selected);
			} else {
				ensureProcessedForTerm(selected);
			}
		}
	});

	$effect(() => {
		if (
			processedData &&
			selected &&
			!session.refreshedTerms.has(selected) &&
			!refreshTried.has(selected)
		) {
			const term = selected;
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
		if (currentEventPrefs) {
			editTitle = (resolved?.title_template ?? titleTemplates[0]) || '';
			editDescription = (resolved?.description_template ?? descriptionTemplates[0]) || '';
			editLocation = (resolved?.location_template ?? locationTemplates[0]) || '';
			editTitleManual = currentEventPrefs.preview?.title ?? '';
			editDescriptionManual = currentEventPrefs.preview?.description ?? '';
			editLocationManual = currentEventPrefs.preview?.location ?? '';
			courseColor = resolvedEventColor();
			notificationsDisabled = currentEventPrefs.notifications_disabled ?? false;

			if (resolved?.reminder_settings && resolved.reminder_settings.length > 0) {
				notifications = resolved.reminder_settings.map((r) => ({
					time: String(r.time),
					type: r.type,
					method: r.method as NotificationMethod
				}));
			} else {
				notifications = [];
			}
		}
	});
	$effect(() => {
		ui.calendarActions = processedData
			? {
					refresh: () => {
						void refreshSchedule(selected);
					},
					copyLink: isOtherCalendar ? copyIcsToClipboard : undefined,
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
					<Button variant="filled" square onclick={() => runScrapeAndProcess(selected)}>
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
			</div>
			{#if comparisonMessage}
				<div class="gap-2 flex flex-wrap items-center justify-between" role="status">
					<p class="text-sm text-on-surface-variant">{comparisonMessage}</p>
					<Button variant="text" onclick={() => ui.friendActions?.retrySchedules()}
						>Reload schedules</Button
					>
					<Button
						variant="text"
						onclick={() => {
							ui.comparison = false;
							ui.highlightedSlot = undefined;
						}}>Exit comparison</Button
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
					onexit={() => {
						ui.comparison = false;
						ui.highlightedSlot = undefined;
					}}
				/>
			{/if}
		{:else}
			{#if !historicSchedule}<WeekNavigation bind:week={ui.week} />{/if}
			{#if processedData || savedData.occurrences.length}
				<CalendarGrid
					{stackedMeetings}
					{dayOrder}
					dates={historicSchedule ? undefined : dates}
					startHour={calendarStartHour}
					latestHour={getLatestEndHour(calendarCourses)}
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

{#if activeCourse && tab === 'a'}
	{#if currentEventPrefs}
		<div
			transition:fade={{ duration: 200 }}
			class="inset-0 bg-scrim/60 p-4 fixed z-50 flex items-center justify-center"
			role="button"
			tabindex="0"
			onclick={(e) => {
				// If a drag began inside the modal and the pointer was released outside,
				// the subsequent scrim click is a byproduct of the drag-release. Ignore it.
				if (lastPointerDownInsideSnapshot && lastPointerUpWasOutside) {
					lastPointerDownInsideSnapshot = false;
					lastPointerUpWasOutside = false;
					e.stopPropagation();
					return;
				}
				activeCourse = undefined;
				activeMeeting = undefined;
				activeDay = undefined;
				notifications = [];
				courseColor = '#d50000';
				currentEventPrefs = undefined;
				editTitle = '';
				editDescription = '';
				editLocation = '';
				editTitleManual = '';
				editDescriptionManual = '';
				editLocationManual = '';
				editMode = false;
			}}
			onkeydown={(e) => {
				// support keyboard activation for the scrim (Enter / Space)
				if (e.key === 'Enter' || e.key === ' ') {
					if (lastPointerDownInsideSnapshot && lastPointerUpWasOutside) {
						lastPointerDownInsideSnapshot = false;
						lastPointerUpWasOutside = false;
						e.stopPropagation();
						return;
					}
					activeCourse = undefined;
					activeMeeting = undefined;
					activeDay = undefined;
					notifications = [];
					courseColor = '#d50000';
					currentEventPrefs = undefined;
					editTitle = '';
					editDescription = '';
					editLocation = '';
					editTitleManual = '';
					editDescriptionManual = '';
					editLocationManual = '';
					editMode = false;
				}
			}}
		>
			<div
				transition:scale={{ duration: 200, start: 0.95 }}
				class="max-w-2xl rounded-2xl bg-surface-container text-on-surface @container relative flex max-h-[90vh] w-full flex-col overflow-hidden shadow-[0_0.75rem_2.5rem_rgb(var(--m3-scheme-shadow)/0.24)]"
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-event-title"
				tabindex="-1"
				bind:this={modalEl}
				onpointerdown={(e) => {
					onPointerDownInside();
					e.stopPropagation();
				}}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<header
					class="gap-3 border-outline-variant px-5 py-4 @max-[24rem]:px-4 flex items-start justify-between border-b"
				>
					<div class="min-w-0">
						<h1
							id="edit-event-title"
							class="m-0 text-xl font-bold text-on-surface tracking-[-0.015em]"
						>
							Edit Calendar Event
						</h1>
						<p class="m-0 mt-1 text-sm text-on-surface-variant truncate">{activeCourse.title}</p>
					</div>
					<div class="gap-2 flex shrink-0 items-center">
						<div class="gap-1.5 flex items-center" role="group" aria-label="Edit mode">
							<Chip
								selected={!editMode}
								variant="input"
								onclick={() => {
									editMode = false;
								}}>Presets</Chip
							>
							<Chip
								selected={editMode}
								variant="input"
								onclick={() => {
									editMode = true;
								}}>{advancedEditing ? 'Templates' : 'Manual'}</Chip
							>
						</div>
						<button
							type="button"
							class="h-9 w-9 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface flex shrink-0 items-center justify-center rounded-full transition-colors"
							aria-label="Close"
							onclick={() => {
								activeCourse = undefined;
								activeMeeting = undefined;
								activeDay = undefined;
								notifications = [];
								courseColor = '#d50000';
								currentEventPrefs = undefined;
								editTitle = '';
								editDescription = '';
								editLocation = '';
								editTitleManual = '';
								editDescriptionManual = '';
								editLocationManual = '';
								editMode = false;
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="22"
								height="22"
								viewBox="0 0 24 24"
								aria-hidden="true"
								><path
									fill="currentColor"
									d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"
								/></svg
							>
						</button>
					</div>
				</header>

				<div class="min-h-0 overflow-y-auto">
					<section class="gap-4 p-5 @max-[24rem]:p-4 flex flex-col">
						{#if editMode && !advancedEditing}
							<div class="gap-3 grid grid-cols-1">
								<TextFieldOutlined label="Course Title" bind:value={editTitleManual} />
								<TextFieldOutlinedMultiline
									label="Course Description"
									bind:value={editDescriptionManual}
									rows={2}
								/>
								<TextFieldOutlined label="Course Location" bind:value={editLocationManual} />
							</div>
						{:else if editMode && advancedEditing}
							<div class="gap-3 grid grid-cols-1">
								<TextFieldOutlined label="Course Title" bind:value={editTitle} />
								<TextFieldOutlinedMultiline
									label="Course Description"
									bind:value={editDescription}
									rows={2}
								/>
								<TextFieldOutlined label="Course Location" bind:value={editLocation} />
							</div>
						{:else}
							<div class="divide-outline-variant flex flex-col divide-y">
								<div
									class="gap-2 py-3 first:pt-0 grid @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start"
								>
									<h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Title</h3>
									<div class="min-w-0 gap-2 flex flex-wrap">
										{#each derivedTemplates.titleTemplates as template, i (titleTemplates[i])}
											{@const selected = isPresetSelected(
												editTitle || resolved?.title_template || '',
												titleTemplates,
												i
											)}
											<Chip
												{selected}
												variant="input"
												onclick={() => {
													editTitle = titleTemplates[i];
												}}>{template.join('')}</Chip
											>
										{/each}
									</div>
								</div>
								<div
									class="gap-2 py-3 grid @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start"
								>
									<h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Description</h3>
									<div class="desc-chips min-w-0 gap-2 flex flex-wrap">
										{#each derivedTemplates.descriptionTemplates as template, i (descriptionTemplates[i])}
											{@const selected =
												editDescription && descriptionTemplates.includes(editDescription)
													? editDescription === descriptionTemplates[i]
													: resolved?.description_template === descriptionTemplates[i]}
											<Chip
												{selected}
												variant="input"
												onclick={() => {
													editDescription = descriptionTemplates[i];
												}}>{template.join('')}</Chip
											>
										{/each}
									</div>
								</div>
								<div
									class="gap-2 pt-3 grid @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start"
								>
									<h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Location</h3>
									<div class="min-w-0 gap-2 flex flex-wrap">
										{#each derivedTemplates.locationTemplates as template, i (locationTemplates[i])}
											{@const selected =
												editLocation && locationTemplates.includes(editLocation)
													? editLocation === locationTemplates[i]
													: resolved?.location_template === locationTemplates[i]}
											<Chip
												{selected}
												variant="input"
												onclick={() => {
													editLocation = locationTemplates[i];
												}}>{template.join('')}</Chip
											>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</section>

					<section class="gap-3 border-outline-variant p-5 @max-[24rem]:p-4 flex flex-col border-t">
						<div class="gap-3 flex flex-row items-center justify-between">
							<div>
								<h2 class="m-0 text-base font-bold text-on-surface">Reminders</h2>
								<p class="m-0 mt-0.5 text-xs text-on-surface-variant">
									Choose when and how to be notified
								</p>
							</div>
							{#if notificationsDisabled}
								<div
									class="gap-1 text-error flex shrink-0 flex-row items-center"
									title="All reminders are currently disabled in Settings. Your reminder preferences are saved and will be restored when you re-enable notifications."
								>
									<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
										<path
											d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
										/>
										<line
											x1="3"
											y1="3"
											x2="21"
											y2="21"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
										/>
									</svg>
									<span class="text-xs font-medium">Do Not Disturb</span>
								</div>
							{/if}
						</div>
						{#if notificationsDisabled}
							<p
								class="m-0 rounded-xl border-error-container bg-error-container/20 p-3 text-sm text-on-surface-variant border"
							>
								<strong>Reminders are muted.</strong> Your settings are preserved but notifications are
								currently disabled. Re-enable notifications in Settings to activate them.
							</p>
						{/if}
						{#each notifications as notification, i (notification)}
							<div
								class={[
									'stuff-moment gap-2 rounded-xl bg-surface-container-low p-3 grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.65fr)_minmax(0,0.8fr)_auto] items-center @max-[30rem]:grid-cols-2',
									notificationsDisabled && 'opacity-50'
								]}
							>
								<SelectOutlined
									label="Method"
									options={[
										{ text: 'Notification', value: 'notification' },
										{ text: 'Email', value: 'email' }
									]}
									bind:value={notifications[i].method}
									disabled={notificationsDisabled}
								/>
								<TextFieldOutlined
									type="number"
									label="Time"
									bind:value={notifications[i].time}
									disabled={notificationsDisabled}
								/>
								<SelectOutlined
									label="Unit"
									options={[
										{ text: 'minutes', value: 'minutes' },
										{ text: 'hours', value: 'hours' },
										{ text: 'days', value: 'days' }
									]}
									bind:value={notifications[i].type}
									disabled={notificationsDisabled}
								/>
								<div class="@max-[30rem]:justify-self-end">
									<Button
										variant="tonal"
										onclick={() => {
											notifications = notifications.filter((_, idx) => idx !== i);
										}}
										disabled={notificationsDisabled}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="20"
											height="20"
											viewBox="0 0 24 24"
											aria-hidden="true"
											><path
												fill="currentColor"
												d="M6 13q-.425 0-.712-.288T5 12t.288-.712T6 11h12q.425 0 .713.288T19 12t-.288.713T18 13z"
											/></svg
										>
									</Button>
								</div>
							</div>
						{/each}
						<div class="flex justify-start">
							<Button
								variant="tonal"
								onclick={() => {
									notifications = [
										...notifications,
										{ time: '30', type: 'minutes', method: 'notification' }
									];
								}}
								disabled={notificationsDisabled}
							>
								<span class="gap-2 flex items-center">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="18"
										height="18"
										viewBox="0 0 24 24"
										aria-hidden="true"
										><path
											fill="currentColor"
											d="M12 21q-.425 0-.712-.288T11 20v-7H4q-.425 0-.712-.288T3 12t.288-.712T4 11h7V4q0-.425.288-.712T12 3t.713.288T13 4v7h7q.425 0 .713.288T21 12t-.288.713T20 13h-7v7q0 .425-.288.713T12 21"
										/></svg
									>
									Add reminder
								</span>
							</Button>
						</div>
					</section>

					<section
						class="gap-4 border-outline-variant p-5 @max-[24rem]:p-4 flex items-center justify-between border-t @max-[24rem]:flex-col @max-[24rem]:items-stretch"
					>
						<div>
							<h2 class="m-0 text-base font-bold text-on-surface">Event color</h2>
							<p class="m-0 mt-0.5 text-xs text-on-surface-variant">
								Used for this class on your calendar
							</p>
						</div>
						<div class="gap-2 flex shrink-0 flex-row items-center">
							<ColorPicker bind:value={courseColor} label="Choose course color" />
						</div>
					</section>
				</div>

				<footer
					class="gap-2 border-outline-variant bg-surface-container px-5 py-3.5 @max-[24rem]:px-4 flex items-center justify-end border-t"
				>
					<Button
						variant="text"
						onclick={() => {
							activeCourse = undefined;
							activeMeeting = undefined;
							activeDay = undefined;
							notifications = [];
							courseColor = '#d50000';
							currentEventPrefs = undefined;
							editTitle = '';
							editDescription = '';
							editLocation = '';
							editTitleManual = '';
							editDescriptionManual = '';
							editLocationManual = '';
							editMode = false;
						}}>Cancel</Button
					>
					<Button variant="filled" square onclick={saveEventPerfs}>Save changes</Button>
				</footer>
			</div>
		</div>
	{/if}
{/if}

<style>
	:global(.stuff-moment div.m3-container) {
		min-width: 7rem !important;
	}

	:global(.peak button) {
		height: 2.5rem !important;
	}

	:global(.desc-chips button.m3-container) {
		flex-shrink: 0;
		width: fit-content;
		height: auto !important;
		min-height: 2.5rem;
		padding-top: 0.5rem !important;
		padding-bottom: 0.5rem !important;
		align-items: center !important;
		white-space: pre-line;
		overflow: visible;
	}

	:global(.unpeak button) {
		transform: scale(0.79);
	}

	:global(.load-test svg) {
		margin-top: -0.5rem !important;
		margin-left: -1.5rem !important;
	}
</style>
