<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { processedData as storedProcessedData, icsUrl as storedIcsUrl, enrolledTerms } from '$lib/store';
    import type { Course, MeetingTime, ResponseData, TermResponse, DayItem, GetPreferencesResponse, TemplateVariables, ResolvedData, NotificationSetting, ReminderSettings, NotificationMethod } from '$lib/types';
    import { Button, LoadingIndicator, SelectOutlined, VariableTabs, TextFieldOutlined, ConnectedButtons, TextFieldOutlinedMultiline, Chip } from 'm3-svelte';
    import { onMount, onDestroy } from 'svelte';
    import { on } from 'svelte/events';
    import { fade, scale } from 'svelte/transition';
    import { API } from '$lib/api';
    import { AuthError, getUsableJwt } from '$lib/auth';
    import Settings from '$lib/components/Settings.svelte';
    import Help from '$lib/components/Help.svelte';
    import RgbColorPicker from '$lib/components/RgbColorPicker.svelte';
    import { userSettings as storedUserSettings } from '$lib/store';
    import { browser } from '$app/environment';
    import { snackbar } from 'm3-svelte';
    import { createWitTab } from '$lib/witTab';
    import { track } from '$lib/telemetry';
    import { getPanelSession } from '$lib/panelSession';

    type RegistrationsLookupResult =
        | { error: string }
        | { termOptions: Array<{ id: string; name: string }>; registrations: unknown[]; usedTermId: string };
    type RegistrationEventsLookupResult =
        | { error: string }
        | { termOptions: Array<{ id: string; name: string }>; events: unknown };

	let selected: string | undefined = $state(undefined);
	let responseData: ResponseData | undefined = $derived($storedProcessedData.find((d) => String(d.termId) === selected)?.responseData);
    let jwt_token: string | undefined = $state(undefined);
	let processedData: Course[] | undefined = $derived(responseData?.classes);
    let activeCourse: Course | undefined = $state(undefined);
    let activeMeeting: MeetingTime | undefined = $state(undefined);
    let activeDay: DayItem | undefined = $state(undefined);
    let loading = $state(false);
    let terms = $state<TermResponse | undefined>(undefined);
	// The router destroys this page when the user opens the friends page. The
	// session keeps what this page already loaded, so coming back sends no requests.
	const session = getPanelSession();
	// Terms whose preference refresh already ran on this page. A failed refresh
	// is not recorded in the session, and this set stops an endless retry.
	const refreshTried = new Set<string>();
    let showHistoricTerms = $derived($storedUserSettings?.show_historic_terms ?? false);
    let displayTerms = $derived((() => {
        const currentTermId = terms?.current_term?.id;
        const fromEnrolled = $enrolledTerms.filter((t) => t?.id);
        const fromApi = [
            terms?.current_term && { id: String(terms.current_term.id), name: terms.current_term.name },
            terms?.next_term && { id: String(terms.next_term.id), name: terms.next_term.name }
        ].filter((t): t is { id: string; name: string } => !!t);
        const base = fromEnrolled.length > 0 ? fromEnrolled : fromApi;
        if (!showHistoricTerms && currentTermId != null) {
            return base.filter(t => parseInt(t.id) >= currentTermId);
        }
        return base;
    })());
    let preferredDisplayTerm = $derived.by(() => {
        if (displayTerms.length === 0) return undefined;
        const currentId = terms?.current_term?.id != null ? String(terms.current_term.id) : undefined;
        const current = currentId ? displayTerms.find(t => t.id === currentId) : undefined;
        if (current) return current;
        return displayTerms.reduce((a, b) =>
            parseInt(a.id, 10) >= parseInt(b.id, 10) ? a : b
        );
    });
    let militaryTime = $derived($storedUserSettings?.military_time ?? true);
    let lectureColor = $derived($storedUserSettings?.default_color_lecture ?? "#039be5");
    let labColor = $derived($storedUserSettings?.default_color_lab ?? "#f6bf26");
    let advancedEditing = $derived($storedUserSettings?.advanced_editing ?? false);
    let isOtherCalendar = $state(browser ? localStorage.getItem('isOtherCalendar') === 'true' : false);

    const EVENT_HEX_TO_WITCC: Record<string, string> = {
        "#a4bdfc": "#7986cb",
        "#7ae7bf": "#33b679",
        "#dbadff": "#8e24aa",
        "#ff887c": "#e67c73",
        "#fbd75b": "#f6bf26",
        "#ffb878": "#f4511e",
        "#46d6db": "#039be5",
        "#e1e1e1": "#616161",
        "#5484ed": "#3f51b5",
        "#51b749": "#0b8043",
        "#dc2127": "#d50000",
    };
    const COLOR_ID_TO_WITCC: Record<string, string> = {
        "1": "#7986cb",
        "2": "#33b679",
        "3": "#8e24aa",
        "4": "#e67c73",
        "5": "#f6bf26",
        "6": "#f4511e",
        "7": "#039be5",
        "8": "#616161",
        "9": "#3f51b5",
        "10": "#0b8043",
        "11": "#d50000",
    };
    function toDropdownColor(color: string | number | null | undefined, fallback = "#d50000"): string {
        if (color == null || color === "") return fallback;
        const normalized = String(color).toLowerCase();
        return EVENT_HEX_TO_WITCC[normalized] ?? COLOR_ID_TO_WITCC[normalized] ?? (normalized.startsWith("#") ? normalized : fallback);
    }
    function defaultEventColor(): string {
        const isLab = (activeCourse?.schedule_type ?? '').toLowerCase() === 'laboratory';
        return toDropdownColor(isLab ? labColor : lectureColor, isLab ? "#f6bf26" : "#039be5");
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
    ]
    let descriptionTemplates = [
        "{{faculty}}\n{{faculty_email}}",
        "{{faculty}}\n{{faculty_email}}\n{{course_code}} {{course_number}}",
        "{{term}} - {{schedule_type}}"
    ]
    let locationTemplates = [
        "{{building}} - {{room}}",
        "{{building}} {{room}}"
    ]

	function parseTemplate(t: string): string[] {
		const evalCond = (cond: string): boolean => {
			const m = cond.match(/^\s*([a-zA-Z0-9_]+)\s*(==|!=)\s*(["'])(.*?)\3\s*$/);
			if (!m) return false;
			const left = m[1] as keyof TemplateVariables;
			const op = m[2];
			const right = m[4];
			const leftVal = String(templates?.[left] ?? '');
			return op === '==' ? leftVal.toLowerCase() === right.toLowerCase() : leftVal.toLowerCase() !== right.toLowerCase();
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
			const falseBlock = hasElse ? s.slice(elseMatch!.index + elseMatch![0].length, endifMatch.index) : '';
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
                value = st === 'laboratory' ? 'Lab' : st === 'lecture' ? 'Lec' : (templates?.schedule_type ?? '');
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
            goto('/beta-access-denied/');
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
            courseColor = "#d50000";
            currentEventPrefs = undefined;
            editTitle = "";
            editDescription = "";
            editLocation = "";
            editTitleManual = "";
            editDescriptionManual = "";
            editLocationManual = "";
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

	function convertTo12Hour(time24: string): string {
		if (militaryTime) return time24;
		const [hours, minutes] = time24.split(':').map(Number);
		const period = hours >= 12 ? 'PM' : 'AM';
		const hours12 = hours % 12 || 12;
		return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
	}

	function getTextColor(bgColor: string): string {
		const hex = bgColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5 ? '#000000' : '#ffffff';
	}

	function formatHourLabel(hour: number): string {
		if (militaryTime) return `${hour.toString().padStart(2, '0')}:00`;
		const period = hour >= 12 ? 'PM' : 'AM';
		const h12 = (hour % 12) || 12;
		return `${h12}:00 ${period}`;
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

    const stackGapPct = 2;

    let stackedMeetings = $derived.by(() => {
        if (!processedData) return { byDay: {}, maxStacksByDay: {} };
        const byDay: Record<string, PositionedMeeting[]> = {};
        const maxStacksByDay: Record<string, number> = {};
        for (const { key } of dayOrder) {
            byDay[key] = [];
            maxStacksByDay[key] = 1;
        }
        for (const course of processedData) {
            if (!course) continue;
            const isLab = (course.schedule_type ?? '').toLowerCase() === 'laboratory';
            const bgColorBase = isLab ? labColor : lectureColor;
            for (const meeting of course.meeting_times ?? []) {
                if (!meeting) continue;
                for (const { key } of dayOrder) {
                    if (!meeting[key as keyof MeetingTime]) continue;
                    const startHour = parseInt(meeting.begin_time.split(':')[0]);
                    const startMin = parseInt(meeting.begin_time.split(':')[1]);
                    const endHour = parseInt(meeting.end_time.split(':')[0]);
                    const endMin = parseInt(meeting.end_time.split(':')[1]);
                    const startTotal = startHour * 60 + startMin;
                    const endTotal = endHour * 60 + endMin;
                    const startOffset = ((startHour - 8) * 60 + startMin) / 60 * 8;
                    const width = (endTotal - startTotal) / 60 * 8;
                    const bgColor = meeting.color ?? bgColorBase;
                    const textColor = getTextColor(bgColor);
                    byDay[key].push({ course, meeting, startOffset, width, startTotal, endTotal, bgColor, textColor, stackIndex: 0, overlapCount: 1 });
                }
            }
        }
        for (const { key } of dayOrder) {
            const arr = byDay[key];
            arr.sort((a, b) => (a.startTotal === b.startTotal ? a.endTotal - b.endTotal : a.startTotal - b.startTotal));
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

    let earliestClassOffsetRem = $derived.by(() => {
        let min = Infinity;
        for (const { key } of dayOrder.slice(0, 5)) {
            for (const item of stackedMeetings.byDay?.[key] ?? []) {
                if (item.startOffset < min) min = item.startOffset;
            }
        }
        return Number.isFinite(min) ? min : 0;
    });

    function scrollToFirstClass(startOffsetRem: number) {
        return (el: HTMLElement) => {
            const frame = requestAnimationFrame(() => {
                const rem = parseFloat(getComputedStyle(el).fontSize) || 16;
                if (el.clientWidth < 20 * rem) return;
                const bufferRem = 2;
                if (startOffsetRem <= bufferRem) {
                    el.scrollLeft = 0;
                    return;
                }
                el.scrollLeft = (startOffsetRem - bufferRem) * rem;
            });
            return () => cancelAnimationFrame(frame);
        };
    }

    function horizontalWheel(el: HTMLElement) {
        let lastWheelAt = 0;
        let lockVertical = false;
        return on(el, 'wheel', (e) => {
            if (el.scrollWidth <= el.clientWidth) return;
            if (e.deltaY === 0 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;

            const now = performance.now();
            if (now - lastWheelAt > 40) lockVertical = false;
            lastWheelAt = now;

            const root = document.scrollingElement ?? document.documentElement;
            const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;
            if (!atBottom || (e.deltaY < 0 && el.scrollLeft <= 1)) {
                lockVertical = true;
                return;
            }
            if (lockVertical) return;

            e.preventDefault();
            el.scrollLeft += e.deltaY;
        }, { passive: false });
    }

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

    async function fetchFromCurrentPage(termId?: string): Promise<{ ics_url: string; termId: string } | undefined> {
        let tabToUse: chrome.tabs.Tab | undefined;
        let shouldCloseTab = false;
        try {
            const targetUrl = 'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

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

                await new Promise(resolve => setTimeout(resolve, 1000));

                // If CAS redirected us to the login page the user isn't authenticated.
                const finalTab = await chrome.tabs.get(tabToUse.id!);
                if (!finalTab.url?.startsWith('https://selfservice.wit.edu/')) {
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
                            ? Array.from(select.options).map(o => ({ id: o.value, name: o.text.trim() }))
                            : [];

                        // If the requested term isn't in the enrolled list, fall back to the first enrolled term
                        let actualTermId = termIdArg;
                        if (termOptions.length > 0 && !termOptions.some(t => t.id === actualTermId)) {
                            actualTermId = termOptions[0].id;
                        }

                        // Get CSRF token for the request
                        const token = document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content') ?? '';

                        // Fetch registrations for the (possibly corrected) term
                        const r = await fetch(
                            `https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/reset?term=${actualTermId}`,
                            {
                                credentials: 'include',
                                headers: {
                                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                                    'X-Requested-With': 'XMLHttpRequest',
                                    ...(token ? { 'X-Synchronizer-Token': token } : {})
                                }
                            }
                        );
                        const data = await r.json();

                        return { termOptions, registrations: data?.data?.registrations ?? [], usedTermId: actualTermId };
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
                API.userSettings({ enrolled_terms: termOptions } as any).catch(() => {});
            }

            if (registrations.length === 0) {
                const termName = termOptions.find(t => t.id === usedTermId)?.name ?? usedTermId;
                const available = termOptions.map(t => t.name).join(', ');
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
        try {
            loading = true;
            const status = await API.userIsProcessed(termId);
            if (status?.processed) {
                const events = await API.getProcessedEvents(termId);
                let ics = $storedIcsUrl;
                if (!ics) {
                    const icsResponse = await API.getIcsUrl();
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
            } else {
                loading = false;
                await runScrapeAndProcess(termId);
            }
        } catch (e) {
            snackbar('Failed to fetch calendar: ' + e, undefined, true);
            console.error('Failed to ensure processed for term:', e);
        } finally {
            loading = false;
        }
    }

    async function getEventPerfs(eventId: number | string) {
        const data = await API.getMeetingTimePreference(eventId);
        courseColor = toDropdownColor(data.resolved?.color_id || activeMeeting?.color, defaultEventColor());
        currentEventPrefs = data;
    }

    function mergeProcessedClasses(existing: Course[] | undefined, fresh: Course[]): Course[] {
        if (!existing?.length) return fresh;
        const overlayById = new Map(
            existing.flatMap((c) =>
                (c.meeting_times ?? [])
                    .filter((mt) => mt?.id != null)
                    .map((mt) => [String(mt.id), { color: mt.color, title_overrides: mt.title_overrides }] as const)
            )
        );
        return fresh.map((c) => ({
            ...c,
            meeting_times: c.meeting_times.map((mt) => {
                const overlay = overlayById.get(String(mt.id));
                return overlay ? { ...mt, color: overlay.color, title_overrides: overlay.title_overrides } : mt;
            })
        }));
    }

    async function syncProcessedEventsForTerm(termId: string) {
        try {
            const events = await API.getProcessedEvents(termId);
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
        }
    }

    const PREFERENCES_BATCH_SIZE = 200;

    // Asks for the preferences of every meeting time in one request per 200 ids,
    // instead of one request per meeting time. If the backend has no batch
    // endpoint yet, it asks for each id on its own, as before.
    async function fetchPreferencesFor(ids: Array<number | string>): Promise<Map<number | string, GetPreferencesResponse>> {
        const map = new Map<number | string, GetPreferencesResponse>();
        const chunks: Array<Array<number | string>> = [];
        for (let i = 0; i < ids.length; i += PREFERENCES_BATCH_SIZE) {
            chunks.push(ids.slice(i, i + PREFERENCES_BATCH_SIZE));
        }

        await Promise.all(chunks.map(async (chunk) => {
            const batch = await API.getMeetingTimePreferences(chunk).catch(() => undefined);
            if (batch) {
                for (const id of chunk) {
                    const data = batch[String(id)];
                    if (data) map.set(id, data);
                }
                return;
            }

            await Promise.all(chunk.map(async (id) => {
                try {
                    const data: GetPreferencesResponse = await API.getMeetingTimePreference(id);
                    if (data) map.set(id, data);
                } catch {
                    // Skip this meeting time, as the page did before.
                }
            }));
        }));

        return map;
    }

    // Returns false when no preferences loaded for a term that has meeting times.
    async function refreshAllEventPrefsForCurrentTerm(): Promise<boolean> {
        if (!selected || !processedData) return false;
        const ids = Array.from(new Set(processedData.flatMap(c => (c.meeting_times ?? []).filter(mt => mt?.id != null).map(mt => mt.id))));
        const map = await fetchPreferencesFor(ids);
        if (!session.active) return false;
        if (map.size === 0) return ids.length === 0;
        const dayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
        storedProcessedData.update((list) => {
            const tid = String(selected);
            const i = list.findIndex((x) => String(x.termId) === tid);
            if (i < 0) return list;
            const entry = list[i];
            const classes = entry.responseData.classes.map((c) => {
                const updatedMeetingTimes = (c.meeting_times ?? []).map((mt) => {
                    if (!mt) return mt;
                    const pref = map.get(mt.id);
                    if (!pref) return mt;
                    const color = pref.resolved?.color_id ? toDropdownColor(pref.resolved.color_id) : mt.color;
                    let title_overrides = mt.title_overrides ?? {};
                    const title = pref.preview?.title;
                    if (title) {
                        for (const k of dayKeys) {
                            if ((mt as any)[k]) {
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
        return true;
    }

    async function runScrapeAndProcess(termId: string | undefined) {
        if (loading) return;
        try {
            loading = true;
            const res = await fetchFromCurrentPage(termId);
            if (!res?.ics_url) {
                throw new Error('No ICS URL in response');
            }
            // Use the term code Banner returned; fall back to what we requested.
            const actualTermId = res.termId || termId;
            if (!actualTermId) {
                throw new Error('Could not determine which term to load');
            }
            if (actualTermId !== termId) {
                selected = actualTermId;
            }
            storedIcsUrl.set(res.ics_url);
            const events = await API.getProcessedEvents(actualTermId);
            if (!Array.isArray(events?.classes)) {
                const msg = (events as any)?.error ?? 'Unexpected response from server';
                throw new Error(`Failed to load calendar events: ${msg}`);
            }
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
            snackbar('Calendar fetched successfully!', undefined, true);
        } catch (e) {
            console.error('Failed to scrape and process:', e);
            track('schedule_import_failed');
            snackbar('Failed to fetch calendar: ' + e, undefined, true);
        } finally {
            loading = false;
        }
    }

    async function refreshSchedule(termId: string | undefined) {
        if (!termId || refreshing || loading) return;
        try {
            refreshing = true;
            lastRefreshResult = null;

            // Scrape current courses from LeopardWeb
            let tabToUse: chrome.tabs.Tab | undefined;
            let shouldCloseTab = false;
            const targetUrl = 'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

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

                await new Promise(resolve => setTimeout(resolve, 1000));
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
                            ? Array.from(select.options).map(o => ({ id: o.value, name: o.text.trim() }))
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

            const refreshTermOptions: Array<{ id: string; name: string }> = refreshResult.termOptions ?? [];
            const registrationData = refreshResult.events ?? [];

            if (refreshTermOptions.length > 0) {
                enrolledTerms.set(refreshTermOptions);
                API.userSettings({ enrolled_terms: refreshTermOptions } as any).catch(() => {});
            }

            if (!Array.isArray(registrationData)) {
                throw new Error('Unexpected response from LeopardWeb');
            }

            // Filter to only the current term's events before reprocessing
            const termFiltered = registrationData.filter((e: any) => String(e.term) === String(termId));
            const eventsToReprocess = termFiltered.length > 0 ? termFiltered : registrationData;

            // Call the reprocess endpoint
            const response = await API.reprocessCourses(eventsToReprocess);

            if (response.ics_url) {
                storedIcsUrl.set(response.ics_url);
            }

            const actualRefreshTermId = String(eventsToReprocess[0]?.term ?? termId);

            const events = await API.getProcessedEvents(actualRefreshTermId);
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
            lastRefreshResult = {
                removed: response.removed_enrollments,
                removedCourses: response.removed_courses
            };

            if (response.removed_enrollments > 0) {
                const courseNames = response.removed_courses.map(c => c.title).join(', ');
                snackbar(`Schedule refreshed. Removed ${response.removed_enrollments} class${response.removed_enrollments > 1 ? 'es' : ''}: ${courseNames}`, undefined, true);
            } else {
                snackbar('Schedule refreshed.', undefined, true);
            }

            // Refresh event preferences after reprocessing
            await refreshAllEventPrefsForCurrentTerm();

        } catch (e) {
            console.error('Failed to refresh schedule:', e);
            snackbar('Failed to refresh schedule: ' + (e instanceof Error ? e.message : String(e)), undefined, true);
        } finally {
            refreshing = false;
        }
    }


    async function saveEventPerfs() {
        const baseUrl = await API.baseUrl;
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

        const descriptionChanged = editDescription !== (resolved?.description_template ?? descriptionTemplates[0]);
        const descriptionManualChanged = editDescriptionManual !== currentEventPrefs?.preview?.description;
        if (descriptionChanged || descriptionManualChanged) {
            event_preference.description_template = descriptionChanged ? editDescription : editDescriptionManual;
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
        const convertedNotifications: ReminderSettings[] = notifications.map(n => ({
            time: (n.time).toString(),
            type: n.type,
            method: n.method
        }));

        const notificationsChanged = JSON.stringify(convertedNotifications) !== JSON.stringify(resolved?.reminder_settings);
        if (notificationsChanged) {
            event_preference.reminder_settings = convertedNotifications;
        }

        event_preference.notifications_disabled = notificationsDisabled;

        if (Object.keys(event_preference).length === 0) {
            activeCourse = undefined;
            activeMeeting = undefined;
            activeDay = undefined;
            currentEventPrefs = undefined;
            editTitle = "";
            editDescription = "";
            editLocation = "";
            editTitleManual = "";
            editDescriptionManual = "";
            editLocationManual = "";
            courseColor = "#d50000";
            notifications = [];
            editMode = false;
            snackbar('No changes made!', undefined, true);
            return;
        }

        const payload = { event_preference };
        const meetingIdForUpdate = activeMeeting?.id;
        if (!meetingIdForUpdate) {
            snackbar('No meeting selected', undefined, true);
            return;
        }
        try {
            await API.updateMeetingTimePreference(meetingIdForUpdate, payload);
            snackbar('Event preferences saved successfully!', undefined, true);
			let updatedTitle: string | undefined = undefined;
			if (titleManualChanged) {
				updatedTitle = editTitleManual;
			} else if (titleChanged) {
				updatedTitle = parseTemplate(editTitle).join('');
			}
			const meetingId = activeMeeting?.id;
			const dayKey = activeDay?.key;
			if (updatedTitle && meetingId && selected && dayKey) {
				storedProcessedData.update((list) => {
					const tid = String(selected);
					const i = list.findIndex((x) => String(x.termId) === tid);
					if (i < 0) return list;
					const entry = list[i];
					const classes = entry.responseData.classes.map((c) => {
						if (!c.meeting_times.some((mt) => mt.id === meetingId)) return c;
						const updatedMeetingTimes = c.meeting_times.map((mt) => {
							if (mt.id !== meetingId) return mt;
							const existing = mt.title_overrides ?? {};
							return { ...mt, title_overrides: { ...existing, [dayKey]: updatedTitle! } };
						});
						return { ...c, meeting_times: updatedMeetingTimes };
					});
					const next = [...list];
					next[i] = {
						termId: entry.termId,
						responseData: {
							ics_url: entry.responseData.ics_url,
							classes
						}
					};
					return next;
				});
			}
			if (colorChanged && meetingId && selected) {
				storedProcessedData.update((list) => {
					const tid = String(selected);
					const i = list.findIndex((x) => String(x.termId) === tid);
					if (i < 0) return list;
					const entry = list[i];
					const classes = entry.responseData.classes.map((c) => {
						if (!c.meeting_times.some((mt) => mt.id === meetingId)) return c;
						const updatedMeetingTimes = c.meeting_times.map((mt) =>
							mt.id === meetingId ? { ...mt, color: courseColor } : mt
						);
						return { ...c, meeting_times: updatedMeetingTimes };
					});
					const next = [...list];
					next[i] = {
						termId: entry.termId,
						responseData: {
							ics_url: entry.responseData.ics_url,
							classes
						}
					};
					return next;
				});
			}
            activeCourse = undefined;
            activeMeeting = undefined;
            activeDay = undefined;
            currentEventPrefs = undefined;
            editTitle = "";
            editDescription = "";
            editLocation = "";
            editTitleManual = "";
            editDescriptionManual = "";
            editLocationManual = "";
            courseColor = "#d50000";
            notifications = [];
            editMode = false;
        } catch (e) {
            activeCourse = undefined;
            activeMeeting = undefined;
            activeDay = undefined;
            currentEventPrefs = undefined;
            editTitle = "";
            editDescription = "";
            editLocation = "";
            editTitleManual = "";
            editDescriptionManual = "";
            editLocationManual = "";
            courseColor = "#d50000";
            notifications = [];
            editMode = false;
            snackbar('Failed to save event preferences: ' + (e instanceof Error ? e.message : String(e)), undefined, true);
        }
    }

    // Check if returning to settings after environment switch (before render)
    let shouldReturnToSettings = browser && sessionStorage.getItem('returnToSettings') === 'true';
    let shouldClearData = browser && sessionStorage.getItem('clearCalendarData') === 'true';
    let tab = $state(shouldReturnToSettings ? "settings" : "a");

    $effect(() => {
        if (tab === 'friends') {
            void goto(resolve('/friends'));
        }
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
    let courseColor = $state("#d50000");
    let editTitle = $state("");
    let editDescription = $state("");
    let editLocation = $state("");
    let editTitleManual = $state("");
    let editDescriptionManual = $state("");
    let editLocationManual = $state("");
    let refreshing = $state(false);
    let lastRefreshResult = $state<{ removed: number; removedCourses: Array<{ crn: number; title: string; course_number: number }> } | null>(null);

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
        if (!selected) {
            if (preferredDisplayTerm?.id) {
                selected = preferredDisplayTerm.id;
            } else if (terms) {
                const initial = terms?.current_term?.id ?? terms?.next_term?.id;
                selected = initial != null ? String(initial) : undefined;
            }
        } else if (displayTerms.length > 0 && !displayTerms.some(t => t?.id === selected)) {
            if (preferredDisplayTerm?.id) selected = preferredDisplayTerm.id;
        }
    });

    $effect(() => {
        if (selected && !loading && !session.attemptedTerms.has(selected)) {
            session.attemptedTerms.add(selected);
            if ($storedProcessedData.some((d) => String(d.termId) === selected)) {
                syncProcessedEventsForTerm(selected);
            } else {
                ensureProcessedForTerm(selected);
            }
        }
    });
    
    $effect(() => {
        if (processedData && selected && !session.refreshedTerms.has(selected) && !refreshTried.has(selected)) {
            const term = selected;
            refreshTried.add(term);
            // Record the term only after a refresh that worked, so the next
            // visit tries a failed one again.
            refreshAllEventPrefsForCurrentTerm().then((ok) => {
                if (ok) session.refreshedTerms.add(term);
            });
        }
    });
    
    $effect(() => {
        if (currentEventPrefs) {
            editTitle = (resolved?.title_template ?? titleTemplates[0]) || "";
            editDescription = (resolved?.description_template ?? descriptionTemplates[0]) || "";
            editLocation = (resolved?.location_template ?? locationTemplates[0]) || "";
            editTitleManual = currentEventPrefs.preview?.title ?? "";
            editDescriptionManual = currentEventPrefs.preview?.description ?? "";
            editLocationManual = currentEventPrefs.preview?.location ?? "";
            courseColor = resolvedEventColor();
            notificationsDisabled = currentEventPrefs.notifications_disabled ?? false;
            
            if (resolved?.reminder_settings && resolved.reminder_settings.length > 0) {
                //@ts-ignore
                notifications = resolved.reminder_settings.map(r => ({
                    time: parseInt(r.time.toString()),
                    type: r.type,
                    method: r.method as NotificationMethod
                }));
            } else {
                notifications = [];
            }
        }
    });
</script>

<div class="@container flex h-full w-full min-w-0 flex-col gap-3 p-3 box-border @max-[20rem]:p-2">
    {#if !processedData && tab === "a"}
        <div class="w-full flex flex-col items-center gap-6 p-6 bg-surface-container rounded-2xl shadow-md max-w-lg mx-auto">
            <div class="flex flex-col gap-1 items-center">
                <div class="flex items-center w-full justify-center relative">
                    <div class="absolute left-0 unpeak">
                        <Button variant="tonal" square onclick={async () => { await goto('/'); }} >
                            <span class="flex flex-row gap-2 items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M9.184 4.457c.3.286.311.76.026 1.06L3.75 11.25H22a.75.75 0 0 1 0 1.5H3.75l5.46 5.733a.75.75 0 1 1-1.086 1.034l-6.667-7a.75.75 0 0 1 0-1.034l6.667-7a.75.75 0 0 1 1.06-.026"/></svg>
                            </span>
                        </Button>
                    </div>
                    <h1 class="text-xl font-bold text-primary text-center mb-1">Get Your Calendar</h1>
                </div>
                <p class="text-md text-secondary text-center">
                    Click the button below to fetch your classes and generate your calendar.
                    If you've linked your Google Calendar, your events will be added there as well!
                    <br><br>
                    If clicking the button below doesn't work, the server may be down.
                    Please check the <a class="text-primary underline hover:text-primary-container" href="https://stats.uptimerobot.com/QS76oPqfzz" target="_blank">status page</a> for updates.
                    If the issue persists, please submit a bug report on <a class="text-primary underline hover:text-primary-container" href="https://github.com/WITCodingClub/calendar-backend/issues" target="_blank">GitHub</a>.
                </p>
            </div>
            <div class="flex flex-col items-center peak gap-2">
                {#if loading}
                    <LoadingIndicator size={44} />
                {:else}
                    <Button
                        variant="filled"
                        square
                        onclick={() => runScrapeAndProcess(selected)}
                    >
                    <span class="flex flex-row gap-2 items-center">
                        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" fill="#FFF3"/><path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" stroke-linecap="round"/><circle cx="7.5" cy="15.5" r="1.25" fill="currentColor"/><circle cx="12" cy="15.5" r="1.25" fill="currentColor"/><circle cx="16.5" cy="15.5" r="1.25" fill="currentColor"/></svg>
                        Get Calendar
                    </span>
                </Button>
                {/if}
            </div>
        </div>
    {:else if processedData || tab !== "a"}
        <section class="w-full flex-none overflow-hidden rounded-2xl bg-surface-container shadow-[0_0.2rem_0.75rem_rgb(var(--m3-scheme-shadow)/0.12)]">
            <header class="flex min-w-0 items-center justify-between gap-4 bg-secondary-container px-[1.125rem] pt-4 pb-3.5 text-on-primary-container @max-[30rem]:flex-col @max-[30rem]:items-start @max-[30rem]:gap-3 @max-[30rem]:p-3.5">
                <div class="min-w-0">
                    <h1 class="m-0 text-[clamp(1.35rem,5cqi,1.8rem)] leading-[1.15] font-[750] tracking-[-0.025em] text-on-secondary-container">
                        {tab === "settings" ? "Settings" : tab === "help" ? "Help" : "Your Calendar"}
                    </h1>
                </div>
                {#if isOtherCalendar}
                    <div class="shrink-0 @max-[30rem]:w-full @max-[30rem]:[&_.m3-container]:w-full">
                        <Button variant="tonal" square onclick={copyIcsToClipboard}>Copy Calendar Link</Button>
                    </div>
                {/if}
            </header>
            <div class="not-peak bg-surface-container-lowest">
                <VariableTabs secondary={true}
                    items={[
                        { name: "Calendar", value: "a" },
                        { name: "Friends", value: "friends" },
                        { name: "Settings", value: "settings" },
                        { name: "Help", value: "help" },
                    ]}
                    bind:tab
                />
            </div>
            {#if tab == "a"}
                <div class="term-bar">
                    <div class="term-seg">
                        <ConnectedButtons>
                        {#each displayTerms as termOpt, i}
                            <input type="radio" name="seg" id="seg-{i}" bind:group={selected} value={termOpt.id} onchange={async () => { const tid = termOpt.id; if (tid && !$storedProcessedData.some((d) => String(d.termId) === tid) && !session.attemptedTerms.has(tid) && !loading) { session.attemptedTerms.add(tid); await ensureProcessedForTerm(tid); } }} />
                            <Button for="seg-{i}" variant="filled">{termOpt.name}</Button>
                        {/each}
                        </ConnectedButtons>
                    </div>
                    <div class="term-refresh">
                        {#if processedData && !refreshing}
                            <Button variant="tonal" onclick={() => refreshSchedule(selected)} disabled={refreshing || loading}>
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                            </Button>
                        {:else if refreshing && processedData}
                            <div class="flex flex-col items-center load-test gap-2">
                                <LoadingIndicator size={44} />
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if tab === "settings"}
                <div class="border-t border-outline-variant bg-surface-container-high px-4 py-3">
                    <h2 class="m-0 text-sm font-bold text-on-surface">Calendar preferences</h2>
                    <p class="m-0 mt-0.5 text-xs text-on-surface-variant">Manage your settings, account information, event notifications, and more!</p>
                </div>
            {:else if tab === "help"}
                <div class="border-t border-outline-variant bg-surface-container-high px-4 py-3">
                    <h2 class="m-0 text-sm font-bold text-on-surface">Information</h2>
                    <p class="m-0 mt-0.5 text-xs text-on-surface-variant">Subscribe in another calendar app or customize event titles with templates.</p>
                </div>
            {/if}
        </section>
    {/if}

    {#if tab === "a" && processedData}
        {@const latestHour = getLatestEndHour(processedData)}
        {@const numHours = latestHour - 8 + 1}
            <div class="@container flex w-full min-w-0 min-h-48 flex-1 flex-col overflow-hidden rounded-2xl bg-surface-container-low shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.1)]">
                <div class="flex-1 overflow-x-auto overflow-y-hidden" {@attach scrollToFirstClass(earliestClassOffsetRem)} {@attach horizontalWheel}>
                    <div class="inline-flex flex-col min-w-full h-full">
                        <div class="flex flex-row border-b border-outline-variant bg-surface-container-high sticky top-0 z-30">
                            <div class="w-24 shrink-0 sticky left-0 z-20 border-r border-outline-variant bg-surface-container-high @max-[20rem]:static"></div>
                            {#each Array(numHours) as _, i}
                                {@const hour = i + 8}
                                <div class="w-32 border-r border-outline-variant flex items-center justify-center py-2">
									<span class="text-xs text-on-surface-variant">{formatHourLabel(hour)}</span>
                                </div>
                            {/each}
                        </div>

                        {#each dayOrder.slice(0, 5) as day}
                            {@const dayEvents = stackedMeetings.byDay?.[day.key] ?? []}
                            <div class="flex flex-row flex-1 min-h-[120px] border-b border-outline-variant relative">
                                <div class="w-24 shrink-0 sticky left-0 z-20 flex items-center justify-center border-r border-outline-variant bg-secondary-container text-on-secondary-container @max-[20rem]:static">
                                    <span class="font-semibold text-sm">{day.label}</span>
                                </div>

                                <div class="relative flex-1 flex">
                                    {#each Array(numHours) as _}
                                        <div class="w-32 border-r border-outline-variant"></div>
                                    {/each}

                                    {#each dayEvents as item (item.meeting.id)}
                                        {@const overlapCount = Math.max(item.overlapCount ?? 1, 1)}
                                        {@const heightPct = Math.max((100 - (overlapCount + 1) * stackGapPct) / overlapCount, 0)}
                                        {@const topPct = stackGapPct + item.stackIndex * (heightPct + stackGapPct)}
                                        {@const rooms = (item.meeting.location?.rooms ?? []).filter(Boolean).join(' / ')}
                                        {@const buildingAbbr = item.meeting.location?.building?.abbreviation ?? ''}
                                        <button
                                            class="absolute rounded px-2 py-1 text-xs overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-t-2"
                                            style={`background-color:${item.bgColor}; color:${item.textColor}; left:${item.startOffset}rem; width:${item.width}rem; top:${topPct}%; height:${heightPct}%; border-color:${item.bgColor};`}
                                            onclick={() => {activeCourse = item.course; activeMeeting = item.meeting; activeDay = day; getEventPerfs(item.meeting.id)}}
                                        >
											<div class="font-medium truncate">{item.meeting.title_overrides?.[day.key] ?? item.course.title}</div>
											<div class="opacity-80">{convertTo12Hour(item.meeting.begin_time)} - {convertTo12Hour(item.meeting.end_time)}</div>
                                            <div class="opacity-70 text-[10px] whitespace-nowrap">{[buildingAbbr, rooms].filter(Boolean).join(' - ')}</div>
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
    {:else if tab === "settings"}
            <Settings />
        {:else if tab === "help"}
            <Help />
    {/if}
</div>

{#if activeCourse && tab === "a"}
    {#if currentEventPrefs}
        <div
            transition:fade={{ duration: 200 }}
            class="fixed inset-0 bg-scrim/60 z-50 flex items-center justify-center p-4"
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
                activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; notifications = []; courseColor = "#d50000"; currentEventPrefs = undefined; editTitle = ""; editDescription = ""; editLocation = ""; editTitleManual = ""; editDescriptionManual = ""; editLocationManual = ""; editMode = false;
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
                    activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; notifications = []; courseColor = "#d50000"; currentEventPrefs = undefined; editTitle = ""; editDescription = ""; editLocation = ""; editTitleManual = ""; editDescriptionManual = ""; editLocationManual = ""; editMode = false;
                }
            }}
        >
            <div
                transition:scale={{ duration: 200, start: 0.95 }}
                class="@container relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface-container text-on-surface shadow-[0_0.75rem_2.5rem_rgb(var(--m3-scheme-shadow)/0.24)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-event-title"
                tabindex="-1"
                bind:this={modalEl}
                onpointerdown={(e) => { onPointerDownInside(); e.stopPropagation(); }}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
            >
                <header class="flex items-start justify-between gap-3 border-b border-outline-variant px-5 py-4 @max-[24rem]:px-4">
                    <div class="min-w-0">
                        <h1 id="edit-event-title" class="m-0 text-xl font-bold tracking-[-0.015em] text-on-surface">Edit Calendar Event</h1>
                        <p class="m-0 mt-1 truncate text-sm text-on-surface-variant">{activeCourse.title}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                        <div class="flex items-center gap-1.5" role="group" aria-label="Edit mode">
                            <Chip selected={!editMode} variant="input" onclick={() => {editMode = false}}>Presets</Chip>
                            <Chip selected={editMode} variant="input" onclick={() => {editMode = true}}>{advancedEditing ? "Templates" : "Manual"}</Chip>
                        </div>
                        <button
                            type="button"
                            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                            aria-label="Close"
                            onclick={() => {activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; notifications = []; courseColor = "#d50000"; currentEventPrefs = undefined; editTitle = ""; editDescription = ""; editLocation = ""; editTitleManual = ""; editDescriptionManual = ""; editLocationManual = ""; editMode = false;}}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"/></svg>
                        </button>
                    </div>
                </header>

                <div class="min-h-0 overflow-y-auto">
                    <section class="flex flex-col gap-4 p-5 @max-[24rem]:p-4">
                    {#if editMode && !advancedEditing}
                        <div class="grid grid-cols-1 gap-3">
                            <TextFieldOutlined label="Course Title" bind:value={editTitleManual} />
                            <TextFieldOutlinedMultiline label="Course Description" bind:value={editDescriptionManual} rows={2} />
                            <TextFieldOutlined label="Course Location" bind:value={editLocationManual} />
                        </div>
                    {:else if editMode && advancedEditing}
                        <div class="grid grid-cols-1 gap-3">
                            <TextFieldOutlined label="Course Title" bind:value={editTitle} />
                            <TextFieldOutlinedMultiline label="Course Description" bind:value={editDescription} rows={2} />
                            <TextFieldOutlined label="Course Location" bind:value={editLocation} />
                        </div>
                    {:else}
                        <div class="flex flex-col divide-y divide-outline-variant">
                            <div class="grid gap-2 py-3 first:pt-0 @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start">
                                <h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Title</h3>
                                <div class="flex min-w-0 flex-wrap gap-2">
                                    {#each derivedTemplates.titleTemplates as template, i (titleTemplates[i])}
                                        {@const selected = isPresetSelected(editTitle || resolved?.title_template || '', titleTemplates, i)}
                                        <Chip selected={selected} variant="input" onclick={() => {editTitle = titleTemplates[i];}}>{template.join('')}</Chip>
                                    {/each}
                                </div>
                            </div>
                            <div class="grid gap-2 py-3 @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start">
                                <h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Description</h3>
                                <div class="desc-chips flex min-w-0 flex-wrap gap-2">
                                    {#each derivedTemplates.descriptionTemplates as template, i (descriptionTemplates[i])}
                                        {@const selected = (editDescription && descriptionTemplates.includes(editDescription)) ? (editDescription === descriptionTemplates[i]) : (resolved?.description_template === descriptionTemplates[i])}
                                        <Chip selected={selected} variant="input" onclick={() => {editDescription = descriptionTemplates[i];}}>{template.join('')}</Chip>
                                    {/each}
                                </div>
                            </div>
                            <div class="grid gap-2 pt-3 @min-[32rem]:grid-cols-[8rem_minmax(0,1fr)] @min-[32rem]:items-start">
                                <h3 class="m-0 pt-2 text-sm font-bold text-on-surface">Location</h3>
                                <div class="flex min-w-0 flex-wrap gap-2">
                                    {#each derivedTemplates.locationTemplates as template, i (locationTemplates[i])}
                                        {@const selected = (editLocation && locationTemplates.includes(editLocation)) ? (editLocation === locationTemplates[i]) : (resolved?.location_template === locationTemplates[i])}
                                        <Chip selected={selected} variant="input" onclick={() => {editLocation = locationTemplates[i];}}>{template.join('')}</Chip>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    {/if}
                    </section>

                    <section class="flex flex-col gap-3 border-t border-outline-variant p-5 @max-[24rem]:p-4">
                        <div class="flex flex-row items-center justify-between gap-3">
                            <div>
                                <h2 class="m-0 text-base font-bold text-on-surface">Reminders</h2>
                                <p class="m-0 mt-0.5 text-xs text-on-surface-variant">Choose when and how to be notified</p>
                            </div>
                            {#if notificationsDisabled}
                                <div class="flex shrink-0 flex-row items-center gap-1 text-error" title="All reminders are currently disabled in Settings. Your reminder preferences are saved and will be restored when you re-enable notifications.">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                                        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                                    </svg>
                                    <span class="text-xs font-medium">Do Not Disturb</span>
                                </div>
                            {/if}
                        </div>
                        {#if notificationsDisabled}
                            <p class="m-0 rounded-xl border border-error-container bg-error-container/20 p-3 text-sm text-on-surface-variant">
                                <strong>Reminders are muted.</strong> Your settings are preserved but notifications are currently disabled. Re-enable notifications in Settings to activate them.
                            </p>
                        {/if}
                        {#each notifications as _, i (notifications[i])}
                            <div class={["stuff-moment grid grid-cols-[minmax(0,1fr)_minmax(5rem,0.65fr)_minmax(0,0.8fr)_auto] items-center gap-2 rounded-xl bg-surface-container-low p-3 @max-[30rem]:grid-cols-2", notificationsDisabled && "opacity-50"]}>
                                <SelectOutlined label="Method"
                                    options={[
                                    { text: "Notification", value: "notification" },
                                    { text: "Email", value: "email" },
                                    ]}
                                    bind:value={notifications[i].method}
                                    disabled={notificationsDisabled}
                                />
                                <TextFieldOutlined type="number" label="Time" bind:value={notifications[i].time} disabled={notificationsDisabled} />
                                <SelectOutlined label="Unit"
                                    options={[
                                    { text: "minutes", value: "minutes" },
                                    { text: "hours", value: "hours" },
                                    { text: "days", value: "days" },
                                    ]}
                                    bind:value={notifications[i].type}
                                    disabled={notificationsDisabled}
                                />
                                <div class="@max-[30rem]:justify-self-end">
                                    <Button variant="tonal" onclick={() => { notifications = notifications.filter((_, idx) => idx !== i); }} disabled={notificationsDisabled}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 13q-.425 0-.712-.288T5 12t.288-.712T6 11h12q.425 0 .713.288T19 12t-.288.713T18 13z"/></svg>
                                    </Button>
                                </div>
                            </div>
                        {/each}
                        <div class="flex justify-start">
                            <Button variant="tonal" onclick={() => { notifications = [...notifications, { time: "30", type: "minutes", method: "notification" }]; }} disabled={notificationsDisabled}>
                                <span class="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21q-.425 0-.712-.288T11 20v-7H4q-.425 0-.712-.288T3 12t.288-.712T4 11h7V4q0-.425.288-.712T12 3t.713.288T13 4v7h7q.425 0 .713.288T21 12t-.288.713T20 13h-7v7q0 .425-.288.713T12 21"/></svg>
                                    Add reminder
                                </span>
                            </Button>
                        </div>
                    </section>

                    <section class="flex items-center justify-between gap-4 border-t border-outline-variant p-5 @max-[24rem]:flex-col @max-[24rem]:items-stretch @max-[24rem]:p-4">
                        <div>
                            <h2 class="m-0 text-base font-bold text-on-surface">Event color</h2>
                            <p class="m-0 mt-0.5 text-xs text-on-surface-variant">Used for this class on your calendar</p>
                        </div>
                        <div class="flex shrink-0 flex-row items-center gap-2">
                            <RgbColorPicker bind:value={courseColor} label="Choose course color" />
                        </div>
                    </section>
                </div>

                <footer class="flex items-center justify-end gap-2 border-t border-outline-variant bg-surface-container px-5 py-3.5 @max-[24rem]:px-4">
                    <Button variant="text" onclick={() => {activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; notifications = []; courseColor = "#d50000"; currentEventPrefs = undefined; editTitle = ""; editDescription = ""; editLocation = ""; editTitleManual = ""; editDescriptionManual = ""; editLocationManual = ""; editMode = false;}}>Cancel</Button>
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

    .term-bar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: 0.5rem;
        width: 100%;
        padding: 0.75rem 1rem;
        border-top: 1px solid rgb(var(--m3-scheme-outline-variant));
        background: rgb(var(--m3-scheme-surface-container-low));
        box-sizing: border-box;
    }

    .term-seg {
        container-type: inline-size;
        min-width: 0;
        display: flex;
        justify-content: flex-start;
    }

    .term-seg > :global(.m3-container) {
        display: flex !important;
        flex-wrap: wrap;
        justify-content: flex-start;
        max-width: 100%;
    }

    .term-seg :global(label.m3-container.s) {
        white-space: nowrap;
    }

    @container (max-width: 14rem) {
        .term-seg :global(label.m3-container.s) {
            font-size: 0.75rem !important;
            padding-inline: 0.7rem !important;
        }
    }

    @container (max-width: 20rem) {
        .term-bar {
            grid-template-columns: minmax(0, 1fr);
            row-gap: 0.5rem;
            padding-inline: 0.625rem;
        }

        .term-refresh {
            display: flex;
            justify-content: center;
        }
    }
</style>
