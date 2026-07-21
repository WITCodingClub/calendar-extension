<script lang="ts">
    import { goto } from '$app/navigation';
    import { processedData as storedProcessedData, icsUrl as storedIcsUrl, enrolledTerms } from '$lib/store';
    import type { Course, MeetingTime, ResponseData, TermResponse, DayItem, GetPreferencesResponse, TemplateVariables, ResolvedData, NotificationSetting, ReminderSettings, NotificationMethod } from '$lib/types';
    import { Button, LoadingIndicator, SelectOutlined, VariableTabs, TextFieldOutlined, ConnectedButtons, TextFieldOutlinedMultiline, Chip } from 'm3-svelte';
    import { onMount, onDestroy } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { API } from '$lib/api';
    import Settings from '$lib/components/Settings.svelte';
    import Help from '$lib/components/Help.svelte';
    import { userSettings as storedUserSettings } from '$lib/store';
    import { browser } from '$app/environment';
    import { snackbar } from 'm3-svelte';

	let selected: string | undefined = $state(undefined);
	let responseData: ResponseData | undefined = $derived($storedProcessedData.find((d) => String(d.termId) === selected)?.responseData);
    let jwt_token: string | undefined = $state(undefined);
	let processedData: Course[] | undefined = $derived(responseData?.classes);
    let activeCourse: Course | undefined = $state(undefined);
    let activeMeeting: MeetingTime | undefined = $state(undefined);
    let activeDay: DayItem | undefined = $state(undefined);
    let loading = $state(false);
    let terms = $state<TermResponse | undefined>(undefined);
	let attemptedTerms = $state(new Set<string>());
	let refreshedTerms = $state(new Set<string>());
    let showHistoricTerms = $derived($storedUserSettings?.show_historic_terms ?? false);
    let displayTerms = $derived((() => {
        const currentTermId = terms?.current_term?.id;
        const base = $enrolledTerms.length > 0
            ? $enrolledTerms
            : terms
                ? [
                    { id: String(terms.current_term.id), name: terms.current_term.name },
                    { id: String(terms.next_term.id), name: terms.next_term.name }
                  ]
                : [];
        if (!showHistoricTerms && currentTermId != null) {
            return base.filter(t => parseInt(t.id) >= currentTermId);
        }
        return base;
    })());
    let militaryTime = $derived($storedUserSettings?.military_time ?? true);
    let lectureColor = $derived($storedUserSettings?.default_color_lecture ?? "#039be5");
    let labColor = $derived($storedUserSettings?.default_color_lab ?? "#f6bf26");
    let advancedEditing = $derived($storedUserSettings?.advanced_editing ?? false);

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
    function toDropdownColor(color: string | number | null | undefined): string {
        if (color == null || color === "") return "#d50000";
        const normalized = String(color).toLowerCase();
        return EVENT_HEX_TO_WITCC[normalized] ?? COLOR_ID_TO_WITCC[normalized] ?? (normalized.startsWith("#") ? normalized : "#d50000");
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
			return op === '==' ? leftVal === right : leftVal !== right;
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
            const isLab = course.schedule_type.toLowerCase() === 'laboratory';
            const bgColorBase = isLab ? labColor : lectureColor;
            for (const meeting of course.meeting_times) {
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

    function getLatestEndHour(courses: Course[]): number {
        let latestHour = 8;

        for (const course of courses) {
            for (const meeting of course.meeting_times) {
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

            const isOnTargetPage = currentTab.url === targetUrl;
            tabToUse = currentTab;
            if (!isOnTargetPage) {
                tabToUse = await chrome.tabs.create({ url: targetUrl });
                shouldCloseTab = true;

                await new Promise<void>((resolve) => {
                    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
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
                func: async (termIdArg) => {
                    try {
                        // Extract the student's enrolled terms from the page dropdown
                        const select = document.querySelector('#lookupFilter');
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

            const result = results[0]?.result ?? {};

            if (result?.error) {
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
        currentEventPrefs = data;
    }

    async function refreshAllEventPrefsForCurrentTerm() {
        if (!selected || !processedData) return;
        const ids = Array.from(new Set(processedData.flatMap(c => c.meeting_times.map(mt => mt.id))));
        const responses = await Promise.all(ids.map(async (id) => {
            try {
                const data: GetPreferencesResponse = await API.getMeetingTimePreference(id);
                return { id, data };
            } catch {
                return undefined;
            }
        }));
        const map = new Map<number | string, GetPreferencesResponse>();
        for (const r of responses) {
            if (r?.id != null && r.data) map.set(r.id, r.data);
        }
        if (map.size === 0) return;
        const dayKeys = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
        storedProcessedData.update((list) => {
            const tid = String(selected);
            const i = list.findIndex((x) => String(x.termId) === tid);
            if (i < 0) return list;
            const entry = list[i];
            const classes = entry.responseData.classes.map((c) => {
                const updatedMeetingTimes = c.meeting_times.map((mt) => {
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
    }

    async function runScrapeAndProcess(termId: string | undefined) {
        if (!termId || loading) return;
        try {
            loading = true;
            const res = await fetchFromCurrentPage(termId);
            if (!res?.ics_url) {
                throw new Error('No ICS URL in response');
            }
            // Use the term code Banner returned; fall back to what we requested.
            const actualTermId = res.termId || termId;
            // If Banner redirected to a different term (e.g. requested Summer but enrolled in Fall),
            // update the selected tab to match.
            if (actualTermId && actualTermId !== termId) {
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
            snackbar('Calendar fetched successfully!', undefined, true);
        } catch (e) {
            console.error('Failed to scrape and process:', e);
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
                tabToUse = await chrome.tabs.create({ url: targetUrl });
                shouldCloseTab = true;

                await new Promise<void>((resolve) => {
                    const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                        if (tabId === tabToUse.id && changeInfo.status === 'complete') {
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
                func: async () => {
                    try {
                        // Extract enrolled terms from the page dropdown
                        const select = document.querySelector('#lookupFilter');
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

            const refreshResult = results[0]?.result ?? {};

            if (refreshResult?.error) {
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

            // Update the store with fresh data
            const events = await API.getProcessedEvents(actualRefreshTermId);
            storedProcessedData.update((list) => {
                const tid = String(actualRefreshTermId);
                const i = list.findIndex((x) => String(x.termId) === tid);
                const next = [...list];
                const ics = response.ics_url || $storedIcsUrl || '';
                const responseData: ResponseData = { ics_url: ics, classes: events.classes };
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
                snackbar('Schedule refreshed. No changes detected.', undefined, true);
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

        const colorChanged = courseColor !== toDropdownColor(resolved?.color_id);
        if (colorChanged) {
            event_preference.color_id = courseColor;
        }

        //@ts-ignore
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
        attemptedTerms = new Set();
        refreshedTerms = new Set();
    }

    async function listenForEnvironmentChanges() {
        chrome.storage.onChanged.addListener((changes: chrome.storage.StorageChanges) => {
            if ('environment_data' in changes) {
                (async () => {
                    checkBetaAccess();
                    jwt_token = await API.getJwtToken();
                    if (!jwt_token) {
                        // No JWT token for current environment, redirect to welcome page
                        goto('/');
                        return;
                    }

                    // IMPORTANT: Clear data FIRST before fetching anything for environment switches
                    // Always clear on environment change detected via listener
                    clearEnvironmentData();

                    // Now fetch fresh data for the current environment
                    terms = await API.getTerms();
                    const envSettings = await API.userSettings();
                    storedUserSettings.set(envSettings);
                    if (envSettings.enrolled_terms?.length && $enrolledTerms.length === 0) {
                        enrolledTerms.set(envSettings.enrolled_terms);
                    }
                })();
            }
        });
    }

    onMount(async () => {
        checkBetaAccess();
        jwt_token = await API.getJwtToken();
        if (!jwt_token) {
            // No JWT token for current environment, redirect to welcome page
            goto('/');
            return;
        }

        // IMPORTANT: Clear data FIRST before fetching anything for environment switches
        if (shouldClearData) {
            clearEnvironmentData();
        }

        // Now fetch fresh data for the current environment
        terms = await API.getTerms();
        const settings = await API.userSettings();
        storedUserSettings.set(settings);
        if (settings.enrolled_terms?.length && $enrolledTerms.length === 0) {
            enrolledTerms.set(settings.enrolled_terms);
        }
        listenForEnvironmentChanges();
    });

    $effect(() => {
        if (!selected) {
            if ($enrolledTerms.length > 0) {
                const processedTermIds = new Set($storedProcessedData.map(d => String(d.termId)));
                const preferred = $enrolledTerms.find(t => processedTermIds.has(t.id)) ?? $enrolledTerms[0];
                selected = preferred.id;
            } else if (terms) {
                const initial = terms?.current_term?.id ?? terms?.next_term?.id;
                selected = initial != null ? String(initial) : undefined;
            }
        }
    });

    $effect(() => {
        if (selected && !$storedProcessedData.some((d) => String(d.termId) === selected) && !loading && !attemptedTerms.has(selected)) {
            const next = new Set(attemptedTerms);
            next.add(selected);
            attemptedTerms = next;
            ensureProcessedForTerm(selected);
        }
    });
    
    $effect(() => {
        if (processedData && selected && !refreshedTerms.has(selected)) {
            const next = new Set(refreshedTerms);
            next.add(selected);
            refreshedTerms = next;
            refreshAllEventPrefsForCurrentTerm();
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
            courseColor = toDropdownColor(resolved?.color_id);
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

<div class="flex flex-col gap-4 justify-center items-center h-full mt-4 w-full px-3">
    {#if !processedData && tab === "a"}
        <div class="w-full flex flex-col items-center gap-6 p-6 bg-surface-container-lowest rounded-md shadow-md border border-outline-variant max-w-lg mx-auto">
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
        <div>
            <div class="flex flex-col gap-1 items-center">
                <h1 class="text-xl font-bold text-primary text-center mb-1">Your Calendar</h1>
                <p class="text-md text-secondary text-center">
                    Subscribe in any calendar app with the link below.
                </p>
                <div class="flex flex-row gap-2 items-center">
                    <Button variant="outlined" square onclick={copyIcsToClipboard}>Copy Calendar Link</Button>
                </div>
            </div>
        </div>
        <div class="not-peak">
            <VariableTabs secondary={true}
                items={[
                    { name: "Calendar", value: "a" },
                    { name: "Settings", value: "settings" },
                    { name: "Help", value: "help" },
                ]}
                bind:tab
            />
        </div>
        <hr class="w-full border-outline-variant" />
        {#if tab == "a"}
            <div class="flex flex-row items-center pl-4 w-full">
                <div class="flex-1"></div>
                <div class="flex justify-center">
                    <ConnectedButtons>
                    {#each displayTerms as termOpt, i}
                        <input type="radio" name="seg" id="seg-{i}" bind:group={selected} value={termOpt.id} onchange={async () => { const tid = termOpt.id; if (tid && !$storedProcessedData.some((d) => String(d.termId) === tid) && !attemptedTerms.has(tid) && !loading) { const next = new Set(attemptedTerms); next.add(tid); attemptedTerms = next; await ensureProcessedForTerm(tid); } }} />
                        <Button for="seg-{i}" variant="filled">{termOpt.name}</Button>
                    {/each}
                    </ConnectedButtons>
                </div>
                <div class="flex-1 flex justify-end gap-3 mr-4">
                    {#if processedData && !refreshing}
                        <Button variant="tonal" onclick={() => refreshSchedule(selected)} disabled={refreshing || loading}>
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                        </Button>
                    {:else if refreshing && processedData}
                        <div class="flex flex-col items-center load-test gap-2 pl-4">
                            <LoadingIndicator size={44} />
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}

    {#if tab === "a" && processedData}
        {@const latestHour = getLatestEndHour(processedData)}
        {@const numHours = latestHour - 8 + 1}
            <div class="flex flex-col w-full h-full overflow-hidden">
                <div class="flex-1 overflow-x-auto overflow-y-hidden">
                    <div class="inline-flex flex-col min-w-full h-full">
                        <div class="flex flex-row border-b border-outline-variant bg-surface-container-lowest sticky top-0 z-10">
                            <div class="w-24 border-r border-outline-variant"></div>
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
                                <div class="w-24 border-r border-outline-variant flex items-center justify-center bg-surface-container-low left-0 z-5">
                                    <span class="font-medium text-sm">{day.label}</span>
                                </div>

                                <div class="relative flex-1 flex">
                                    {#each Array(numHours) as _}
                                        <div class="w-32 border-r border-outline-variant"></div>
                                    {/each}

                                    {#each dayEvents as item (item.meeting.id)}
                                        {@const overlapCount = Math.max(item.overlapCount ?? 1, 1)}
                                        {@const heightPct = Math.max((100 - (overlapCount + 1) * stackGapPct) / overlapCount, 0)}
                                        {@const topPct = stackGapPct + item.stackIndex * (heightPct + stackGapPct)}
                                        <button
                                            class="absolute rounded px-2 py-1 text-xs overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-t-2"
                                            style={`background-color:${item.bgColor}; color:${item.textColor}; left:${item.startOffset}rem; width:${item.width}rem; top:${topPct}%; height:${heightPct}%; border-color:${item.bgColor};`}
                                            onclick={() => {activeCourse = item.course; activeMeeting = item.meeting; activeDay = day; getEventPerfs(item.meeting.id)}}
                                        >
											<div class="font-medium truncate">{item.meeting.title_overrides?.[day.key] ?? item.course.title}</div>
											<div class="opacity-80">{convertTo12Hour(item.meeting.begin_time)} - {convertTo12Hour(item.meeting.end_time)}</div>
                                            <div class="opacity-70 text-[10px]">{item.meeting.location.building.abbreviation} {item.meeting.location.room}</div>
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
                class="relative bg-surface-container-low rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                role="dialog"
                aria-modal="true"
                tabindex="-1"
                bind:this={modalEl}
                onpointerdown={(e) => { onPointerDownInside(); e.stopPropagation(); }}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
            >
                <div class="flex flex-col gap-4 p-6">
                    <div class="mb-2 flex flex-row gap-2 items-center">
                        <div class="flex flex-row gap-2 items-center">
                            <h1 class="text-2xl font-bold">Edit Calendar Event</h1>
                            <Chip selected={editMode} variant="input" onclick={() => {editMode = !editMode}}>Edit Manually</Chip>
                            <div class="tailwindcss flex flex-row items-center space-between absolute right-4">
                                <Button variant="tonal" onclick={() => {activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; notifications = []; courseColor = "#d50000"; currentEventPrefs = undefined; editTitle = ""; editDescription = ""; editLocation = ""; editTitleManual = ""; editDescriptionManual = ""; editLocationManual = ""; editMode = false;}}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"/></svg>
                                </Button>
                            </div>
                        </div>
                    </div>
                    {#if editMode && !advancedEditing}
                        <TextFieldOutlined label="Course Title" bind:value={editTitleManual} />
                        <TextFieldOutlinedMultiline label="Course Description" bind:value={editDescriptionManual} rows={1} />
                        <TextFieldOutlined label="Course Location" bind:value={editLocationManual} />
                    {:else if editMode && advancedEditing}
                        <TextFieldOutlined label="Course Title" bind:value={editTitle} />
                        <TextFieldOutlinedMultiline label="Course Description" bind:value={editDescription} rows={1} />
                        <TextFieldOutlined label="Course Location" bind:value={editLocation} />
                    {:else}
                    <div class="flex flex-col gap-2">
                        <h2 class="text-md">Event Title</h2>
						<div class="flex flex-row gap-2 items-center">
							{#each derivedTemplates.titleTemplates as template, i}
								{@const selected = (editTitle && titleTemplates.includes(editTitle)) ? (editTitle === titleTemplates[i]) : (resolved?.title_template === titleTemplates[i])}
								<Chip selected={selected} variant="input" onclick={() => {editTitle = titleTemplates[i];}}>{template.join('')}</Chip>
                            {/each}
                        </div>
                        <h2 class="text-md">Event Description</h2>
                        <div class="flex flex-row flex-wrap gap-2 items-center peak desc-chips">
							{#each derivedTemplates.descriptionTemplates as template, i}
								{@const selected = (editDescription && descriptionTemplates.includes(editDescription)) ? (editDescription === descriptionTemplates[i]) : (resolved?.description_template === descriptionTemplates[i])}
								<Chip selected={selected} variant="input" onclick={() => {editDescription = descriptionTemplates[i];}}>{template.join('')}</Chip>
                            {/each}
                        </div>
                        <h2 class="text-md">Event Location</h2>
                        <div class="flex flex-row gap-2 items-center">
							{#each derivedTemplates.locationTemplates as template, i}
								{@const selected = (editLocation && locationTemplates.includes(editLocation)) ? (editLocation === locationTemplates[i]) : (resolved?.location_template === locationTemplates[i])}
								<Chip selected={selected} variant="input" onclick={() => {editLocation = locationTemplates[i];}}>{template.join('')}</Chip>
                            {/each}
                        </div>
                    </div>
                    {/if}
                    <div class="flex flex-col gap-3">
                        <div class="flex flex-row items-center gap-2 justify-between">
                            <h2 class="text-md">Remind me before class</h2>
                            {#if notificationsDisabled}
                                <div class="flex flex-row items-center gap-1 text-error" title="All reminders are currently disabled in Settings. Your reminder preferences are saved and will be restored when you re-enable notifications.">
                                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                                        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                                    </svg>
                                    <span class="text-xs font-medium">Do Not Disturb</span>
                                </div>
                            {/if}
                        </div>
                        {#if notificationsDisabled}
                            <p class="text-sm text-on-surface-variant bg-error-container/20 p-3 rounded-md border border-error-container">
                                <strong>Reminders are muted.</strong> Your settings are preserved but notifications are currently disabled. Re-enable notifications in Settings to activate them.
                            </p>
                        {/if}
                        {#each notifications, i}
                        <div class="flex flex-row gap-2 items-center stuff-moment peak {notificationsDisabled ? 'opacity-50' : ''}">
                            <SelectOutlined label=""
                                options={[
                                { text: "Notification", value: "notification" },
                                { text: "Email", value: "email" },
                                ]}
                                bind:value={notifications[i].method}
                                disabled={notificationsDisabled}
                            />
                            <TextFieldOutlined type="number" label="" bind:value={notifications[i].time} disabled={notificationsDisabled} />
                            <SelectOutlined label=""
                                options={[
                                { text: "minutes", value: "minutes" },
                                { text: "hours", value: "hours" },
                                { text: "days", value: "days" },
                                ]}
                                bind:value={notifications[i].type}
                                disabled={notificationsDisabled}
                            />
                            <Button variant="tonal" onclick={() => { notifications = notifications.filter((_, idx) => idx !== i); }} disabled={notificationsDisabled}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M6 13q-.425 0-.712-.288T5 12t.288-.712T6 11h12q.425 0 .713.288T19 12t-.288.713T18 13z"/></svg>
                            </Button>
                        </div>
                        {/each}
                        <Button variant="tonal" onclick={() => { notifications = [...notifications, { time: "30", type: "minutes", method: "notification" }]; }} disabled={notificationsDisabled}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21q-.425 0-.712-.288T11 20v-7H4q-.425 0-.712-.288T3 12t.288-.712T4 11h7V4q0-.425.288-.712T12 3t.713.288T13 4v7h7q.425 0 .713.288T21 12t-.288.713T20 13h-7v7q0 .425-.288.713T12 21"/></svg>
                        </Button>
                        <h2 class="text-md">Color</h2>
                        <div class="flex flex-row gap-2 items-center">
                            <div class="w-6 h-6 rounded-full border-2 border-outline other-stuff" style="background-color: {courseColor};"></div>
                            <SelectOutlined label=""
                                options={[
                                    { text: "Tomato", value: "#d50000" },
                                    { text: "Flamingo", value: "#e67c73" },
                                    { text: "Tangerine", value: "#f4511e" },
                                    { text: "Banana", value: "#f6bf26" },
                                    { text: "Sage", value: "#33b679" },
                                    { text: "Basil", value: "#0b8043" },
                                    { text: "Peacock", value: "#039be5" },
                                    { text: "Blueberry", value: "#3f51b5" },
                                    { text: "Lavender", value: "#7986cb" },
                                    { text: "Grape", value: "#8e24aa" },
                                    { text: "Graphite", value: "#616161" },
                                ]}
                                bind:value={courseColor}
                            />
                        </div>
                        <Button variant="tonal" square onclick={saveEventPerfs}>Save</Button>
                    </div>
                </div>
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
        align-items: flex-start !important;
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