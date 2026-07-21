<script lang="ts">
    import { API } from '$lib/api';
    import { processedData as storedProcessedData, userSettings as storedUserSettings } from '$lib/store';
    import type { Course, DayItem, FriendIdentity, FriendProcessedEventsResponse, FriendRequestIncoming, FriendRequestOutgoing, MeetingTime } from '$lib/types';
    import { onMount } from 'svelte';
    import { fade, scale } from 'svelte/transition';
    import { Chip, SelectOutlined, TextFieldOutlined, VariableTabs } from 'm3-svelte';

    let currentTermId = $state<string | undefined>(undefined);
    let termsFetched = $state(false);
    let selected = $derived.by(() => {
        if (!termsFetched || $storedProcessedData.length === 0) return undefined;
        const data = $storedProcessedData;
        if (currentTermId && data.some((d) => String(d.termId) === currentTermId)) {
            return currentTermId;
        }
        const latest = data.reduce((a, b) =>
            parseInt(String(a.termId), 10) >= parseInt(String(b.termId), 10) ? a : b
        );
        return String(latest.termId);
    });
    let processedData: Course[] | undefined = $derived(
        $storedProcessedData.find((d) => String(d.termId) === selected)?.responseData.classes
    );
    let militaryTime = $derived($storedUserSettings?.military_time ?? true);
    let lectureColor = $derived($storedUserSettings?.default_color_lecture ?? "#039be5");
    let labColor = $derived($storedUserSettings?.default_color_lab ?? "#f6bf26");
    let primaryUser = $state<string>('you');

    let activeCourse = $state<Course | undefined>(undefined);
    let activeMeeting = $state<MeetingTime | undefined>(undefined);
    let activeDay = $state<DayItem | undefined>(undefined);
    let friendIdentities = $state<FriendIdentity[]>([]);
    let friendList = $state<Array<{ id: string; name: string; courses: Course[] }>>([]);
    let incomingRequests = $state<FriendRequestIncoming[]>([]);
    let outgoingRequests = $state<FriendRequestOutgoing[]>([]);
    let selectedFriends = $state<string[]>([]);
    let sendFriendIdInput = $state<string>('');
    let friendsLoading = $state<boolean>(false);
    let requestsLoading = $state<boolean>(false);
    let schedulesLoading = $state<boolean>(false);
    let pageError = $state<string>('');
    let actionLoadingId = $state<string>('');
    let schedulesLoadVersion = 0;

    type RawFriendMeeting = {
        id?: number | string;
        begin_time: string;
        end_time: string;
        day_of_week?: string;
        start_date?: string;
        end_date?: string;
        monday?: boolean;
        tuesday?: boolean;
        wednesday?: boolean;
        thursday?: boolean;
        friday?: boolean;
        saturday?: boolean;
        sunday?: boolean;
        color?: string;
        title_overrides?: Partial<Record<DayItem['key'], string>>;
        location?: {
            building?: {
                name?: string;
                abbreviation?: string;
            };
            room?: string;
        };
    };

    type RawFriendCourse = {
        title: string;
        subject?: string;
        prefix?: string;
        course_number?: number | string;
        schedule_type?: string;
        professor?: {
            first_name?: string;
            last_name?: string;
            email?: string;
        };
        term?: {
            uid?: number | string;
            season?: string;
            year?: number | string;
        };
        instructors?: Array<{
            first_name?: string;
            last_name?: string;
            email?: string;
        }>;
        meeting_times?: RawFriendMeeting[];
    };

    function parseTimeToMinutes(timeStr: string): number {
        const trimmed = timeStr.trim();
        const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (ampmMatch) {
            let hours = Number(ampmMatch[1]);
            const minutes = Number(ampmMatch[2]);
            const isPm = ampmMatch[3].toUpperCase() === 'PM';
            if (hours === 12) hours = 0;
            const total = hours + (isPm ? 12 : 0);
            return total * 60 + minutes;
        }
        const parts = trimmed.split(':');
        const h = Number(parts[0]);
        const m = Number(parts[1] ?? 0);
        return h * 60 + m;
    }

    function to24Hour(timeStr: string): string {
        const mins = parseTimeToMinutes(timeStr);
        return minutesToHHMM(mins);
    }

    function minutesToHHMM(total: number): string {
        const h = Math.floor(total / 60);
        const m = total % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    function mapFriendCourses(data: FriendProcessedEventsResponse & { classes?: RawFriendCourse[] }, friendId: string): Course[] {
        const processedCourses = Array.isArray(data?.processed_courses)
            ? (data.processed_courses as RawFriendCourse[])
            : (Array.isArray(data?.classes) ? data.classes : []);
        return processedCourses.map((c, ci: number) => ({
            title: c.title,
            prefix: c.subject ?? c.prefix ?? '',
            course_number: Number(c.course_number ?? 0),
            schedule_type: c.schedule_type ?? '',
            term: { uid: Number(c.term?.uid ?? 0), season: c.term?.season ?? '', year: Number(c.term?.year ?? 0) },
            professor: {
                first_name: c.professor?.first_name ?? c.instructors?.[0]?.first_name ?? '',
                last_name: c.professor?.last_name ?? c.instructors?.[0]?.last_name ?? '',
                email: c.professor?.email ?? c.instructors?.[0]?.email ?? ''
            },
            meeting_times: (Array.isArray(c.meeting_times) ? c.meeting_times : []).map((m, mi: number) => {
                const begin = to24Hour(m.begin_time);
                const end = to24Hour(m.end_time);
                const dayKey = String(m.day_of_week ?? '').toLowerCase() as DayItem['key'];
                const hasDayFlags = (
                    m.monday !== undefined ||
                    m.tuesday !== undefined ||
                    m.wednesday !== undefined ||
                    m.thursday !== undefined ||
                    m.friday !== undefined ||
                    m.saturday !== undefined ||
                    m.sunday !== undefined
                );
                return {
                    id: m.id ?? `${friendId}-${ci}-${mi}-${dayKey}`,
                    begin_time: begin,
                    end_time: end,
                    start_date: m.start_date ?? '',
                    end_date: m.end_date ?? '',
                    location: {
                        building: {
                            name: m.location?.building?.name ?? '',
                            abbreviation: m.location?.building?.abbreviation ?? ''
                        },
                        room: m.location?.room ?? ''
                    },
                    monday: hasDayFlags ? Boolean(m.monday) : dayKey === 'monday',
                    tuesday: hasDayFlags ? Boolean(m.tuesday) : dayKey === 'tuesday',
                    wednesday: hasDayFlags ? Boolean(m.wednesday) : dayKey === 'wednesday',
                    thursday: hasDayFlags ? Boolean(m.thursday) : dayKey === 'thursday',
                    friday: hasDayFlags ? Boolean(m.friday) : dayKey === 'friday',
                    saturday: hasDayFlags ? Boolean(m.saturday) : dayKey === 'saturday',
                    sunday: hasDayFlags ? Boolean(m.sunday) : dayKey === 'sunday',
                    color: m.color,
                    title_overrides: m.title_overrides
                };
            })
        }));
    }

    type CalendarBlock = {
        course: Course;
        meeting: MeetingTime;
        startTotal: number;
        endTotal: number;
        ownerId: string;
        ownerPriority: number;
        isPrimary: boolean;
    };

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

    let meetMinDurationMinutesInput = $state<string>('30');
    let meetBufferMinutesInput = $state<string>('10');
    let meetMinDurationMinutes = $derived(Math.max(0, Math.floor(Number(meetMinDurationMinutesInput) || 0)));
    let meetBufferMinutes = $derived(Math.max(0, Math.floor(Number(meetBufferMinutesInput) || 0)));
    let meetBetweenClassesOnly = $state<boolean>(false);
    let meetRangeStartInput = $state<string>('08:00');
    let meetRangeEndInput = $state<string>('20:00');
    let meetRangeStart = $derived(Math.max(8 * 60, Math.min(20 * 60, parseTimeToMinutes(meetRangeStartInput))));
    let meetRangeEnd = $derived(Math.max(8 * 60, Math.min(20 * 60, parseTimeToMinutes(meetRangeEndInput))));
    let meetRangeValid = $derived(meetRangeEnd > meetRangeStart);

    type MeetWindow = { start: number; end: number; duration: number };
    type MeetInterval = { start: number; end: number };

    let tab = $state<'calendar' | 'meeting'>('calendar');

    let bestMeetTimesByDay = $derived.by(() => {
        const dayStart = meetRangeStart;
        const dayEnd = meetRangeEnd;
        if (!meetRangeValid) return {};

        const selectedFriendCourses = friendList
            .filter((f) => selectedFriends.includes(f.id))
            .flatMap((f) => f.courses);

        const weekdays = dayOrder.slice(0, 5).map((d) => d.key);
        const byDay: Record<string, MeetWindow[]> = {};

        if (selectedFriendCourses.length === 0) {
            for (const key of weekdays) byDay[key] = [];
            return byDay;
        }

        const meetingOccursOnDay = (meeting: MeetingTime, dayKey: DayItem['key']): boolean => {
            return Boolean((meeting as unknown as Record<string, boolean>)[dayKey]);
        };

        const collectBusyIntervals = (dayKey: DayItem['key']): MeetInterval[] => {
            const intervals: MeetInterval[] = [];
            for (const course of selectedFriendCourses) {
                for (const meeting of course.meeting_times) {
                    if (!meetingOccursOnDay(meeting, dayKey)) continue;
                    const rawStart = parseTimeToMinutes(meeting.begin_time);
                    const rawEnd = parseTimeToMinutes(meeting.end_time);
                    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
                    const start = Math.max(dayStart, rawStart - meetBufferMinutes);
                    const end = Math.min(dayEnd, rawEnd + meetBufferMinutes);
                    if (end <= start) continue;
                    intervals.push({ start, end });
                }
            }
            intervals.sort((a, b) => (a.start - b.start) || (a.end - b.end));
            return intervals;
        };

        const mergeIntervals = (sorted: MeetInterval[]): MeetInterval[] => {
            const merged: MeetInterval[] = [];
            for (const it of sorted) {
                const last = merged[merged.length - 1];
                if (!last || it.start > last.end) {
                    merged.push({ start: it.start, end: it.end });
                    continue;
                }
                last.end = Math.max(last.end, it.end);
            }
            return merged;
        };

        const windowsFromMerged = (merged: MeetInterval[]): MeetWindow[] => {
            const windows: MeetWindow[] = [];
            if (meetBetweenClassesOnly) {
                for (let i = 0; i < merged.length - 1; i++) {
                    const start = merged[i].end;
                    const end = merged[i + 1].start;
                    const dur = end - start;
                    if (dur >= meetMinDurationMinutes) windows.push({ start, end, duration: dur });
                }
                return windows;
            }

            let cursor = dayStart;
            for (const b of merged) {
                if (b.start > cursor) {
                    const dur = b.start - cursor;
                    if (dur >= meetMinDurationMinutes) {
                        windows.push({ start: cursor, end: b.start, duration: dur });
                    }
                }
                cursor = Math.max(cursor, b.end);
            }
            if (cursor < dayEnd) {
                const dur = dayEnd - cursor;
                if (dur >= meetMinDurationMinutes) {
                    windows.push({ start: cursor, end: dayEnd, duration: dur });
                }
            }
            return windows;
        };

        for (const key of weekdays) {
            const merged = mergeIntervals(collectBusyIntervals(key as DayItem['key']));
            if (merged.length === 0) {
                byDay[key] = [];
                continue;
            }
            const windows = windowsFromMerged(merged);
            windows.sort((a, b) => (b.duration - a.duration) || (a.start - b.start));
            byDay[key] = windows.slice(0, 3);
        }

        return byDay;
    });

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
        ownerId: string;
        ownerPriority: number;
        isPrimary: boolean;
    };

    const stackGapPct = 2;

    let stackedMeetings = $derived.by(() => {
        const selectedFriendCourses = friendList
            .filter((f) => selectedFriends.includes(f.id))
            .map((f) => ({ id: f.id, courses: f.courses }));

        const ownerEntries: Array<{ id: string; courses: Course[]; isPrimary: boolean }> = [];

        if (primaryUser === 'you') {
            if (processedData) {
                ownerEntries.push({ id: 'you', courses: processedData, isPrimary: true });
            }
        } else {
            const primaryFriend = selectedFriendCourses.find((f) => f.id === primaryUser) ?? friendList.find((f) => f.id === primaryUser);
            if (primaryFriend) {
                ownerEntries.push({ id: primaryFriend.id, courses: primaryFriend.courses, isPrimary: true });
            }
        }

        if (primaryUser !== 'you' && processedData) {
            ownerEntries.push({ id: 'you', courses: processedData, isPrimary: false });
        }

        for (const entry of selectedFriendCourses) {
            if (entry.id === primaryUser) continue;
            ownerEntries.push({ id: entry.id, courses: entry.courses, isPrimary: false });
        }

        if (ownerEntries.length === 0) {
            return { byDay: {}, maxStacksByDay: {} };
        }

        const collectIntervals = (courses: Course[], ownerId: string, ownerPriority: number, isPrimary: boolean): CalendarBlock[] => {
            const blocks: CalendarBlock[] = [];
            for (const course of courses) {
                for (const meeting of course.meeting_times) {
                    const startTotal = parseTimeToMinutes(meeting.begin_time);
                    const endTotal = parseTimeToMinutes(meeting.end_time);
                    for (const { key } of dayOrder) {
                        if (!(meeting as unknown as Record<DayItem['key'], boolean>)[key]) continue;
                        blocks.push({ course, meeting, startTotal, endTotal, ownerId, ownerPriority, isPrimary });
                    }
                }
            }
            return blocks;
        };

        const allBlocks = ownerEntries.flatMap((entry, idx) => collectIntervals(entry.courses, entry.id, idx, entry.isPrimary));

        const byDay: Record<string, PositionedMeeting[]> = {};
        const maxStacksByDay: Record<string, number> = {};

        for (const { key } of dayOrder) {
            const seen: Record<string, boolean> = {};
            const blocks = allBlocks.filter((b) => {
                if (!(b.meeting as unknown as Record<DayItem['key'], boolean>)[key]) return false;
                const k = `${b.ownerId}-${b.startTotal}-${b.endTotal}-${b.course.title}`;
                if (seen[k]) return false;
                seen[k] = true;
                return true;
            });
            if (blocks.length === 0) {
                byDay[key] = [];
                maxStacksByDay[key] = 1;
                continue;
            }

            blocks.sort((a, b) => {
                if (a.startTotal !== b.startTotal) return a.startTotal - b.startTotal;
                if (a.endTotal !== b.endTotal) return a.endTotal - b.endTotal;
                return a.ownerPriority - b.ownerPriority;
            });

            const arr: PositionedMeeting[] = [];
            const stackEnds: number[] = [];
            const active: PositionedMeeting[] = [];

            for (const block of blocks) {
                for (let i = active.length - 1; i >= 0; i--) {
                    if (block.startTotal >= active[i].endTotal) {
                        active.splice(i, 1);
                    }
                }

                const startHour = Math.floor(block.startTotal / 60);
                const startMin = block.startTotal % 60;
                const startOffset = ((startHour - 8) * 60 + startMin) / 60 * 8;
                const width = (block.endTotal - block.startTotal) / 60 * 8;
                const isLab = block.course.schedule_type.toLowerCase() === 'laboratory';
                const baseColor = block.meeting.color ?? (isLab ? labColor : lectureColor);
                const textColor = getTextColor(baseColor);
                const currentOverlap = active.length + 1;
                const item: PositionedMeeting = {
                    course: block.course,
                    meeting: block.meeting,
                    startOffset,
                    width,
                    startTotal: block.startTotal,
                    endTotal: block.endTotal,
                    bgColor: baseColor,
                    textColor,
                    stackIndex: 0,
                    overlapCount: currentOverlap,
                    ownerId: block.ownerId,
                    ownerPriority: block.ownerPriority,
                    isPrimary: block.isPrimary
                };

                for (const a of active) {
                    a.overlapCount = Math.max(a.overlapCount, currentOverlap);
                }

                let stack = stackEnds.findIndex((end) => item.startTotal >= end);
                if (stack === -1) {
                    stack = stackEnds.length;
                    stackEnds.push(item.endTotal);
                } else {
                    stackEnds[stack] = item.endTotal;
                }
                item.stackIndex = stack;

                active.push(item);
                arr.push(item);
            }

            const componentIds = new Array(arr.length).fill(-1);
            let component = 0;
            for (let i = 0; i < arr.length; i++) {
                if (componentIds[i] !== -1) continue;
                const queue = [i];
                componentIds[i] = component;
                while (queue.length) {
                    const idx = queue.pop()!;
                    for (let j = 0; j < arr.length; j++) {
                        if (componentIds[j] !== -1) continue;
                        if (arr[idx].startTotal < arr[j].endTotal && arr[j].startTotal < arr[idx].endTotal) {
                            componentIds[j] = component;
                            queue.push(j);
                        }
                    }
                }
                component++;
            }

            const componentMax = new Array(component).fill(1);
            for (let c = 0; c < component; c++) {
                const points: Array<{ time: number; delta: number }> = [];
                for (let i = 0; i < arr.length; i++) {
                    if (componentIds[i] !== c) continue;
                    points.push({ time: arr[i].startTotal, delta: 1 });
                    points.push({ time: arr[i].endTotal, delta: -1 });
                }
                points.sort((a, b) => (a.time - b.time) || (a.delta - b.delta));
                let activeCount = 0;
                let peak = 0;
                for (const p of points) {
                    activeCount += p.delta;
                    if (activeCount > peak) peak = activeCount;
                }
                componentMax[c] = Math.max(peak, 1);
            }

            for (let i = 0; i < arr.length; i++) {
                arr[i].overlapCount = componentMax[componentIds[i]];
            }

            const dayMax = Math.max(...componentMax, 1);
            byDay[key] = arr;
            maxStacksByDay[key] = dayMax;
        }

        return { byDay, maxStacksByDay };
    });

    function getLatestEndHourFromBlocks(): number {
        let latest = 8;
        for (const { key } of dayOrder) {
            for (const item of stackedMeetings.byDay?.[key] ?? []) {
                const endHour = Math.floor(item.endTotal / 60);
                const endMin = item.endTotal % 60;
                const rounded = endMin > 0 ? endHour + 1 : endHour;
                if (rounded > latest) latest = rounded;
            }
        }
        return latest;
    }

    async function loadFriendsAndRequests() {
        pageError = '';
        friendsLoading = true;
        requestsLoading = true;
        try {
            const [friendsResponse, requestsResponse] = await Promise.all([
                API.getFriends(),
                API.getFriendRequests()
            ]);
            friendIdentities = friendsResponse.friends ?? [];
            incomingRequests = requestsResponse.incoming ?? [];
            outgoingRequests = requestsResponse.outgoing ?? [];
        } catch (error) {
            console.error('Failed to load friends data', error);
            pageError = 'Failed to load friends data.';
        } finally {
            friendsLoading = false;
            requestsLoading = false;
        }
    }

    async function loadFriendSchedules(termUid: string) {
        const loadVersion = ++schedulesLoadVersion;
        schedulesLoading = true;
        try {
            const coursesByFriend = await Promise.all(friendIdentities.map(async (friend) => {
                try {
                    const response = await API.getFriendProcessedEvents(friend.id, termUid);
                    return { id: friend.id, courses: mapFriendCourses(response, friend.id) };
                } catch (error) {
                    try {
                        const status = await API.friendIsProcessed(friend.id, termUid);
                        if (!status.processed) {
                            return { id: friend.id, courses: [] as Course[] };
                        }
                    } catch (statusError) {
                        console.error(`Failed to check processed status for ${friend.id}`, statusError);
                    }
                    console.error(`Failed to load schedule for ${friend.id}`, error);
                    return { id: friend.id, courses: [] as Course[] };
                }
            }));
            if (loadVersion !== schedulesLoadVersion) return;
            const coursesMap = new Map(coursesByFriend.map((f) => [f.id, f.courses]));
            friendList = friendIdentities.map((friend) => ({
                id: friend.id,
                name: friend.name,
                courses: coursesMap.get(friend.id) ?? []
            }));
            selectedFriends = selectedFriends.filter((id) => friendIdentities.some((f) => f.id === id));
            if (selectedFriends.length === 0 && friendIdentities.length > 0) {
                selectedFriends = [friendIdentities[0].id];
            }
            if (primaryUser !== 'you' && !friendIdentities.some((f) => f.id === primaryUser)) {
                primaryUser = 'you';
            }
        } finally {
            if (loadVersion === schedulesLoadVersion) {
                schedulesLoading = false;
            }
        }
    }

    async function sendFriendRequest() {
        const friendId = sendFriendIdInput.trim();
        if (!friendId) return;
        actionLoadingId = 'send-request';
        pageError = '';
        try {
            await API.createFriendRequest(friendId);
            sendFriendIdInput = '';
            await loadFriendsAndRequests();
        } catch (error) {
            console.error('Failed to send friend request', error);
            pageError = 'Failed to send friend request.';
        } finally {
            actionLoadingId = '';
        }
    }

    async function acceptRequest(requestId: string) {
        actionLoadingId = `accept-${requestId}`;
        pageError = '';
        try {
            await API.acceptFriendRequest(requestId);
            await loadFriendsAndRequests();
            if (selected) {
                await loadFriendSchedules(selected);
            }
        } catch (error) {
            console.error('Failed to accept request', error);
            pageError = 'Failed to accept request.';
        } finally {
            actionLoadingId = '';
        }
    }

    async function declineRequest(requestId: string) {
        actionLoadingId = `decline-${requestId}`;
        pageError = '';
        try {
            await API.declineFriendRequest(requestId);
            await loadFriendsAndRequests();
        } catch (error) {
            console.error('Failed to decline request', error);
            pageError = 'Failed to decline request.';
        } finally {
            actionLoadingId = '';
        }
    }

    async function cancelRequest(requestId: string) {
        actionLoadingId = `cancel-${requestId}`;
        pageError = '';
        try {
            await API.cancelFriendRequest(requestId);
            await loadFriendsAndRequests();
        } catch (error) {
            console.error('Failed to cancel request', error);
            pageError = 'Failed to cancel request.';
        } finally {
            actionLoadingId = '';
        }
    }

    async function unfriend(friendId: string) {
        actionLoadingId = `unfriend-${friendId}`;
        pageError = '';
        try {
            await API.removeFriend(friendId);
            await loadFriendsAndRequests();
            if (selected) {
                await loadFriendSchedules(selected);
            }
        } catch (error) {
            console.error('Failed to remove friend', error);
            pageError = 'Failed to remove friend.';
        } finally {
            actionLoadingId = '';
        }
    }

    onMount(async () => {
        try {
            const terms = await API.getTerms();
            if (terms?.current_term?.id != null) {
                currentTermId = String(terms.current_term.id);
            }
        } finally {
            termsFetched = true;
        }
        await loadFriendsAndRequests();
    });

    $effect(() => {
        if (!selected) return;
        if (friendIdentities.length === 0) {
            friendList = [];
            selectedFriends = [];
            return;
        }
        void loadFriendSchedules(selected);
    });
</script>

<div class="flex flex-col gap-3 justify-center items-center h-full mt-2 w-full px-3">
    <div class="flex flex-col gap-2.5 w-full max-w-3xl">
        {#if pageError}
            <div class="text-sm text-error">{pageError}</div>
        {/if}
        <div class="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
            <div class="flex flex-col gap-2">
                <div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Send friend request</div>
                <div class="flex flex-row gap-2 items-center flex-wrap sm:flex-nowrap">
                    <TextFieldOutlined
                        label="Friend ID"
                        bind:value={sendFriendIdInput}
                        onkeydown={(e) => {
                            if (e.key === 'Enter') {
                                sendFriendRequest();
                            }
                        }}
                    />
                    <button
                        class="h-10 px-3 rounded bg-primary text-on-primary text-sm whitespace-nowrap disabled:opacity-50"
                        disabled={actionLoadingId === 'send-request' || !sendFriendIdInput.trim()}
                        onclick={sendFriendRequest}
                    >
                        Send
                    </button>
                </div>
            </div>

            {#if requestsLoading || incomingRequests.length > 0 || outgoingRequests.length > 0}
                <div class="h-px bg-outline-variant"></div>
                <div class="flex flex-col gap-1.5">
                    <div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Requests</div>
                    {#if requestsLoading}
                        <div class="text-xs text-on-surface-variant">Loading requests...</div>
                    {:else}
                        <div class="grid gap-1.5 md:grid-cols-2">
                            {#if incomingRequests.length > 0}
                                <div class="flex flex-col gap-1">
                                    <div class="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Incoming</div>
                                    {#each incomingRequests as req (req.request_id)}
                                        <div class="flex flex-row items-center justify-between gap-2 bg-surface-container-lowest rounded-md px-2 py-1.5 border border-outline-variant">
                                            <div class="text-sm truncate">{req.from.name} ({req.from.id})</div>
                                            <div class="flex flex-row gap-1 shrink-0">
                                                <button
                                                    class="px-2 py-1 rounded bg-primary text-on-primary text-xs disabled:opacity-50"
                                                    disabled={actionLoadingId !== '' && actionLoadingId !== `accept-${req.request_id}`}
                                                    onclick={() => acceptRequest(req.request_id)}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    class="px-2 py-1 rounded bg-error text-on-error text-xs disabled:opacity-50"
                                                    disabled={actionLoadingId !== '' && actionLoadingId !== `decline-${req.request_id}`}
                                                    onclick={() => declineRequest(req.request_id)}
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            {#if outgoingRequests.length > 0}
                                <div class="flex flex-col gap-1">
                                    <div class="text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">Outgoing</div>
                                    {#each outgoingRequests as req (req.request_id)}
                                        <div class="flex flex-row items-center justify-between gap-2 bg-surface-container-lowest rounded-md px-2 py-1.5 border border-outline-variant">
                                            <div class="text-sm truncate">{req.to.name} ({req.to.id})</div>
                                            <button
                                                class="px-2 py-1 rounded bg-error text-on-error text-xs shrink-0 disabled:opacity-50"
                                                disabled={actionLoadingId !== '' && actionLoadingId !== `cancel-${req.request_id}`}
                                                onclick={() => cancelRequest(req.request_id)}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="h-px bg-outline-variant"></div>
            <div class="flex flex-row gap-2 items-center flex-wrap">
                <div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant whitespace-nowrap">Primary</div>
                <SelectOutlined
                    label=""
                    options={[
                        { text: 'You', value: 'you' },
                        ...friendList
                            .filter((f) => selectedFriends.includes(f.id))
                            .map((f) => ({ text: f.name, value: f.id }))
                    ]}
                    bind:value={primaryUser}
                />
            </div>

            <div class="flex flex-col gap-1.5">
                <div class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Friends</div>
                {#if friendsLoading || schedulesLoading}
                    <div class="text-xs text-on-surface-variant">Loading friends...</div>
                {:else if friendList.length === 0}
                    <div class="text-xs text-on-surface-variant">No accepted friends yet.</div>
                {:else}
                    <div class="flex flex-wrap gap-1.5">
                        {#each friendList as friend (friend.id)}
                            <div class="flex flex-row gap-1 items-center border border-outline-variant rounded-md px-1.5 py-1">
                                <Chip
                                    variant="input"
                                    selected={selectedFriends.includes(friend.id)}
                                    onclick={() => {
                                        const exists = selectedFriends.includes(friend.id);
                                        const next = exists
                                            ? selectedFriends.filter((id) => id !== friend.id)
                                            : [...selectedFriends, friend.id];
                                        selectedFriends = next;
                                        if (primaryUser !== 'you' && !next.includes(primaryUser)) {
                                            primaryUser = 'you';
                                        }
                                    }}
                                >
                                    {friend.name}
                                </Chip>
                                <button
                                    class="px-2 py-1 rounded bg-error text-on-error text-xs disabled:opacity-50"
                                    disabled={actionLoadingId !== '' && actionLoadingId !== `unfriend-${friend.id}`}
                                    onclick={() => unfriend(friend.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    <div class="w-full max-w-3xl">
        <VariableTabs
            secondary={true}
            items={[
                { name: 'Calendar', value: 'calendar' },
                { name: 'Meeting Times', value: 'meeting' }
            ]}
            bind:tab
        />
    </div>

    {#if tab === 'calendar'}
        {#if Object.values(stackedMeetings.byDay ?? {}).some((arr) => arr.length > 0)}
            {@const latestHour = getLatestEndHourFromBlocks()}
            {@const numHours = latestHour - 8 + 1}
            {@const hourIndices = Array.from({ length: numHours }, (_, i) => i)}
            <div class="flex flex-col w-full h-full overflow-hidden">
                <div class="flex-1 overflow-x-auto overflow-y-hidden">
                    <div class="inline-flex flex-col min-w-full h-full">
                        <div class="flex flex-row border-b border-outline-variant bg-surface-container-lowest sticky top-0 z-10">
                            <div class="w-24 border-r border-outline-variant"></div>
                            {#each hourIndices as i (i)}
                                {@const hour = i + 8}
                                <div class="w-32 border-r border-outline-variant flex items-center justify-center py-2">
                                    <span class="text-xs text-on-surface-variant">{formatHourLabel(hour)}</span>
                                </div>
                            {/each}
                        </div>

                        {#each dayOrder.slice(0, 5) as day (day.key)}
                            {@const dayEvents = stackedMeetings.byDay?.[day.key] ?? []}
                            {@const dayStacks = Math.max(stackedMeetings.maxStacksByDay?.[day.key] ?? 1, 1)}
                            {@const dayHeight = Math.min(Math.max(120, dayStacks * 52), 190)}
                            <div class="flex flex-row flex-1 border-b border-outline-variant relative" style={`height:${dayHeight}px; min-height:${dayHeight}px;`}>
                                <div class="w-24 border-r border-outline-variant flex items-center justify-center bg-surface-container-low left-0 z-5">
                                    <span class="font-medium text-sm">{day.label}</span>
                                </div>

                                <div class="relative flex-1 flex">
                                    {#each hourIndices as i (`grid-${day.key}-${i}`)}
                                        <div class="w-32 border-r border-outline-variant"></div>
                                    {/each}

                                    {#each dayEvents as item (`${item.ownerId}-${item.meeting.id}`)}
                                        {@const overlapCount = Math.max(item.overlapCount ?? 1, 1)}
                                        {@const heightPct = Math.max((100 - (overlapCount + 1) * stackGapPct) / overlapCount, 0)}
                                        {@const topPct = stackGapPct + item.stackIndex * (heightPct + stackGapPct)}
                                        <button
                                            class="absolute rounded px-2 py-1 text-xs overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-t-2"
                                            style={`background-color:${item.bgColor}; color:${item.textColor}; left:${item.startOffset}rem; width:${item.width}rem; top:${topPct}%; height:${heightPct}%; border-color:${item.bgColor}; opacity:${item.isPrimary ? 1 : 0.5};`}
                                            onclick={() => {activeCourse = item.course; activeMeeting = item.meeting; activeDay = day;}}
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
        {:else}
            <div class="text-sm text-secondary">No calendar data available.</div>
        {/if}
    {:else}
        <div class="flex flex-col gap-3 w-full max-w-3xl mt-2">
            <div class="flex flex-row gap-3 items-center justify-between flex-wrap">
                <div class="flex flex-col">
                    <div class="text-sm text-on-surface-variant">Best times to meet</div>
                    <div class="text-xs text-on-surface-variant">Common free time for selected friends, between 8am–8pm.</div>
                </div>
                <div class="flex flex-row gap-2 items-center flex-wrap">
                    <TextFieldOutlined type="number" label="Min (min)" bind:value={meetMinDurationMinutesInput} />
                    <TextFieldOutlined type="number" label="Buffer (min)" bind:value={meetBufferMinutesInput} />
                    <TextFieldOutlined type="time" label="Start" bind:value={meetRangeStartInput} />
                    <TextFieldOutlined type="time" label="End" bind:value={meetRangeEndInput} />
                    <Chip variant="input" selected={meetBetweenClassesOnly} onclick={() => { meetBetweenClassesOnly = !meetBetweenClassesOnly; }}>
                        Between classes
                    </Chip>
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-3 w-full max-w-3xl mt-2">
            {#if selectedFriends.length === 0}
                <div class="text-sm text-secondary">Select at least one friend to see suggestions.</div>
            {:else if !meetRangeValid}
                <div class="text-sm text-secondary">Invalid time range.</div>
            {:else if Object.values(bestMeetTimesByDay ?? {}).some((arr) => arr.length > 0)}
                <div class="flex flex-col gap-2">
                    {#each dayOrder.slice(0, 5) as day (day.key)}
                        {@const windows = bestMeetTimesByDay?.[day.key] ?? []}
                        {#if windows.length > 0}
                            <div class="flex flex-row gap-3 items-start justify-between bg-surface-container-low rounded-lg p-3 border border-outline-variant">
                                <div class="font-medium text-sm w-24">{day.label}</div>
                                <div class="flex-1 flex flex-row gap-2 flex-wrap justify-end">
                                    {#each windows as w (`${day.key}-${w.start}-${w.end}`)}
                                        <Chip variant="input" selected={false} onclick={() => {}}>
                                            {convertTo12Hour(minutesToHHMM(w.start))} – {convertTo12Hour(minutesToHHMM(w.end))} ({w.duration}m)
                                        </Chip>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>
            {:else}
                <div class="text-sm text-secondary">No meeting windows match your filters.</div>
            {/if}
        </div>
    {/if}

</div>

{#if activeCourse}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed inset-0 bg-scrim/60 z-50 flex items-center justify-center p-4"
        role="button"
        tabindex="0"
        onclick={(e) => { if (e.target === e.currentTarget) { activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; } }}
        onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { activeCourse = undefined; activeMeeting = undefined; activeDay = undefined; } }}
    >
        <div
            transition:scale={{ duration: 200, start: 0.95 }}
            class="relative bg-surface-container-low rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
            <div class="flex flex-col gap-4 p-6">
                <div class="flex justify-between">
                    <h1 class="font-bold text-2xl">{activeCourse.title}</h1>
                    <button
                        class="p-2 rounded-full hover:bg-surface-container-high text-on-surface"
                        aria-label="Close"
                        onclick={() => {activeCourse = undefined; activeMeeting = undefined; activeDay = undefined;}}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z"/></svg>
                    </button>
                </div>
                {#if activeMeeting && activeDay}
                    <div class="text-sm text-on-surface-variant">
                        {activeDay.label}: {convertTo12Hour(activeMeeting.begin_time)} - {convertTo12Hour(activeMeeting.end_time)}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}
