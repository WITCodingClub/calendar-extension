import type { PanelUi } from '../panel/ui.svelte';
import type { Course } from '../types';
import {
	CAMPUS_TIME_ZONE,
	calendarDateTime,
	dateLabel,
	hasExpired,
	minutesTime,
	timeMinutes,
	todayDate
} from '../datetime';
import { WEEKDAYS } from '../calendar/days';
import {
	validDate,
	validateCourses,
	validateTermBounds,
	validBusyRange,
	busyEndMinutes,
	busyForRange,
	busyRangeKey,
	type BusyBlock
} from './schedule';
import type { FreePeriod, MeetingPreferences, ScheduleClass, PreviewSlot } from './types';

export function dayClasses(date: string, selected: string[], source: ScheduleClass[]) {
	const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
	return source.filter(
		(item) =>
			selected.includes(item.personId) &&
			item.days.includes(weekday) &&
			item.startDate <= date &&
			item.endDate >= date
	);
}

export function mergeBusy(intervals: Array<{ start: number; end: number }>) {
	const merged: Array<{ start: number; end: number }> = [];
	for (const interval of intervals.toSorted((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
		else merged.push({ ...interval });
	}
	return merged;
}

export function findFreePeriods(
	selected: string[],
	preferences: MeetingPreferences,
	source: ScheduleClass[],
	bounds?: { start?: string; end?: string },
	now = new Date(),
	blocks?: Array<BusyBlock & { personId?: string }>
): { periods: FreePeriod[]; message?: string } {
	const duration = Number(preferences.duration);
	const buffer = Number(preferences.buffer);
	const dailyStart = timeMinutes(preferences.dailyStart);
	const dailyEnd = busyEndMinutes(preferences.dailyEnd);
	const from = new Date(`${preferences.from}T00:00:00Z`);
	const until = new Date(`${preferences.until}T00:00:00Z`);
	if (!selected.length) return { periods: [], message: 'Choose people to find shared free time.' };
	if (
		!Number.isFinite(from.getTime()) ||
		!Number.isFinite(until.getTime()) ||
		from.toISOString().slice(0, 10) !== preferences.from ||
		until.toISOString().slice(0, 10) !== preferences.until ||
		preferences.from > preferences.until
	)
		return { periods: [], message: 'Choose a valid date range.' };
	if (!validBusyRange(preferences.from, preferences.until))
		return { periods: [], message: 'Choose a date range of 120 days or fewer.' };
	if (
		(bounds?.start && preferences.from < bounds.start) ||
		(bounds?.end && preferences.until > bounds.end)
	)
		return {
			periods: [],
			message: 'Choose dates within the current term.'
		};
	if (
		!Number.isInteger(duration) ||
		duration <= 0 ||
		!preferences.duration.trim() ||
		!Number.isInteger(buffer) ||
		buffer < 0 ||
		!preferences.buffer.trim()
	)
		return {
			periods: [],
			message: 'Enter a positive duration and a buffer of zero or more minutes.'
		};
	if (dailyStart === undefined || dailyEnd === undefined || dailyStart >= dailyEnd)
		return { periods: [], message: 'Choose a daily start before the daily end.' };
	const periods: FreePeriod[] = [];
	try {
		validateTermBounds(bounds ?? {});
	} catch {
		return { periods: [], message: 'Invalid term dates. Reload schedules to try again.' };
	}
	const today = todayDate(CAMPUS_TIME_ZONE);
	const clock = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: CAMPUS_TIME_ZONE,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(now)
			.map((part) => [part.type, part.value])
	);
	const earliestToday = Number(clock.hour) * 60 + Number(clock.minute) + 1;
	for (const date = new Date(from); date <= until; date.setUTCDate(date.getUTCDate() + 1)) {
		if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
		const dateString = date.toISOString().slice(0, 10);
		if (dateString < today) continue;
		const dayBusy = blocks?.filter((block) => block.date === dateString);
		const classes = dayClasses(dateString, selected, source).filter(
			(item) =>
				!dayBusy ||
				dayBusy.some(
					(block) =>
						(!block.personId || block.personId === item.personId) &&
						timeMinutes(block.start)! <= timeMinutes(item.start)! &&
						busyEndMinutes(block.end)! >= timeMinutes(item.end)!
				)
		);
		let start = dateString === today ? Math.max(dailyStart, earliestToday) : dailyStart;
		let end = dailyEnd;
		if (preferences.betweenClasses) {
			if (!classes.length) continue;
			start = Math.max(start, Math.min(...classes.map((item) => timeMinutes(item.start)!)));
			end = Math.min(end, Math.max(...classes.map((item) => timeMinutes(item.end)!)));
		}
		const busy = mergeBusy(
			(dayBusy ?? classes).map((item) => ({
				start: timeMinutes(item.start)! - buffer,
				end: busyEndMinutes(item.end)! + buffer
			}))
		);
		function addPeriod(periodStart: number, periodEnd: number) {
			if (periodEnd - periodStart >= duration)
				periods.push({
					id: `${dateString}-${periodStart}-${periodEnd}`,
					date: dateString,
					day: dateLabel(dateString),
					start: periodStart,
					end: periodEnd
				});
		}
		let cursor = start;
		for (const interval of busy) {
			if (interval.end <= cursor || interval.start >= end) continue;
			addPeriod(cursor, Math.min(interval.start, end));
			cursor = Math.max(cursor, interval.end);
			if (cursor >= end) break;
		}
		addPeriod(cursor, end);
	}
	return { periods };
}

export function meetingSlot(period: FreePeriod, start: number, duration: number): PreviewSlot {
	return {
		id: `${period.id}-${start}-${duration}`,
		date: period.date,
		day: period.day,
		start: minutesTime(start),
		end: minutesTime(start + duration),
		window: `${minutesTime(period.start)}–${minutesTime(period.end)}`
	};
}

export function schedulingClasses(courses: Course[], personId = 'you'): ScheduleClass[] {
	const days = WEEKDAYS.slice(0, 5);
	return courses.flatMap((course) =>
		(course.meeting_times ?? []).map((meeting) => ({
			id: `${personId}:${meeting.id}`,
			personId,
			title: course.title,
			code: `${course.prefix} ${course.course_number}`,
			location: [meeting.location?.building?.name, ...(meeting.location?.rooms ?? [])]
				.filter(Boolean)
				.join(' '),
			instructor: [course.professor?.first_name, course.professor?.last_name]
				.filter(Boolean)
				.join(' '),
			days: days.flatMap((day, index) => (meeting[day] ? [index] : [])),
			start: meeting.begin_time,
			end: meeting.end_time,
			startDate: meeting.start_date?.slice(0, 10) || '',
			endDate: meeting.end_date?.slice(0, 10) || '9999-12-31'
		}))
	);
}

export function scheduleMessage(ui: PanelUi, ownCourses?: Course[]): string | undefined {
	const term = ui.scheduleTerm;
	if (ui.termError) return ui.termError;
	if (ui.friendsError) return ui.friendsError;
	if (!ui.hasSelectedFriends)
		return ui.friendsLoading ? 'Loading friends…' : 'Select some friends to plan together.';
	if (!term) return 'Loading the current term…';
	if (ui.selected.includes('you')) {
		const status = ui.scheduleStatus[term]?.you;
		if (status === 'error' || status === 'unprocessed')
			return (
				ui.scheduleErrors[term]?.you ??
				'Could not load your schedule. Reload schedules to try again.'
			);
		if (status === 'loading' || !ownCourses) return 'Loading your class schedule…';
		try {
			validateCourses(ownCourses);
		} catch {
			return 'Your schedule contains invalid class data. Reload schedules to try again.';
		}
	}
	for (const id of ui.selected.filter((id) => id !== 'you')) {
		const status = ui.scheduleStatus[term]?.[id];
		const person = ui.friends.find((person) => person.id === id);
		if (!person) return 'Choose people from your current friends.';
		if (hasExpired(person.expires_at, ui.now))
			return `${person.name}'s friendship has expired. Reload friends.`;
		if (person.visibility?.theirs === 'availability_only') continue;
		if (!status || status === 'loading') return `Loading ${person.name}'s schedule…`;
		if (status !== 'loaded')
			return (
				ui.scheduleErrors[term]?.[id] ??
				(status === 'unprocessed'
					? `${person.name} has not set up a class schedule for this term.`
					: `Could not load ${person.name}'s schedule. Reload schedules to try again.`)
			);
		try {
			validateCourses(ui.friendSchedules[term]?.[id]);
		} catch {
			return `${person.name}'s schedule contains invalid class data. Reload schedules to try again.`;
		}
	}
}

export function scheduleAvailability(
	ui: PanelUi,
	ownCourses?: Course[],
	preferences = ui.preferences
) {
	if (
		!validDate(preferences.from) ||
		preferences.from.length !== 10 ||
		!validDate(preferences.until) ||
		preferences.until.length !== 10 ||
		preferences.from > preferences.until
	)
		return { periods: [], message: 'Choose a valid date range.' };
	if (!validBusyRange(preferences.from, preferences.until))
		return { periods: [], message: 'Choose a date range of 120 days or fewer.' };
	const busyMessage = availabilityMessage(ui, preferences.from, preferences.until);
	if (busyMessage) return { periods: [], message: busyMessage };
	const message = scheduleMessage(ui, ownCourses);
	if (message && preferences.betweenClasses) return { periods: [], message };
	if (preferences.betweenClasses && ui.hasAvailabilityOnly)
		return {
			periods: [],
			message: 'Between classes needs full class details for every selected participant.'
		};
	const term = ui.scheduleTerm!;
	const source = preferences.betweenClasses
		? [
				...(ui.selected.includes('you') ? schedulingClasses(ownCourses ?? []) : []),
				...ui.selected
					.filter((id) => id !== 'you')
					.flatMap((id) => schedulingClasses(ui.friendSchedules[term]?.[id] ?? [], id))
			]
		: [];
	return findFreePeriods(
		ui.selected,
		preferences,
		source,
		ui.termBounds[term],
		new Date(Math.max(ui.now, Date.now())),
		ui.selected.flatMap((id) =>
			(busyForRange(ui.busyBlocks, id, preferences.from, preferences.until)?.busy ?? []).map(
				(block) => ({ ...block, personId: id })
			)
		)
	);
}

export function availabilityMessage(ui: PanelUi, from: string, until: string): string | undefined {
	if (ui.termError) return ui.termError;
	if (ui.friendsError) return ui.friendsError;
	if (!validBusyRange(from, until)) return 'Choose a valid date range of 120 days or fewer.';
	for (const id of ui.selected) {
		const person = ui.friends.find((friend) => friend.id === id);
		if (id !== 'you' && (!person || hasExpired(person.expires_at, ui.now)))
			return 'A selected friendship is no longer available. Reload friends.';
		const range = busyRangeKey(from, until);
		if (!busyForRange(ui.busyBlocks, id, from, until)) {
			if (ui.busyStatus[range]?.[id] === 'error')
				return (
					ui.busyErrors[range]?.[id] ??
					'Could not load availability. Reload schedules to try again.'
				);
			return `Loading ${person?.name ?? 'your'} availability…`;
		}
	}
}

export function meetingMessage(
	ui: PanelUi,
	ownCourses: Course[] | undefined,
	slot: PreviewSlot
): string | undefined {
	const start = timeMinutes(slot.start);
	const end = busyEndMinutes(slot.end);
	if (!validDate(slot.date) || slot.date.length !== 10) return 'Choose a valid meeting date.';
	if (start === undefined || end === undefined || start >= end)
		return 'Choose a valid start time and an end after it.';
	if (slot.date < todayDate(CAMPUS_TIME_ZONE)) return 'Choose today or a future date.';
	const now = new Date(Math.max(ui.now, Date.now()));
	try {
		if (Date.parse(calendarDateTime(slot.date, minutesTime(start))) <= now.getTime())
			return 'This start time has passed. Choose a later time.';
	} catch (error) {
		return error instanceof Error ? error.message : 'Choose a valid meeting date and time.';
	}
	const weekday = new Date(slot.date + 'T00:00:00Z').getUTCDay();
	if (weekday === 0 || weekday === 6) return 'Choose a weekday for this meeting.';
	const availability = scheduleAvailability(ui, ownCourses, {
		...ui.preferences,
		from: slot.date,
		until: slot.date,
		duration: String(end - start),
		dailyStart: minutesTime(start),
		dailyEnd: minutesTime(end),
		betweenClasses: false
	});
	if (availability.message) return availability.message;
	if (!availability.periods.length)
		return 'This time overlaps selected busy time or its buffer. Choose another time.';
}
