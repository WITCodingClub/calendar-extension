import type { PanelUi } from '$lib/panelUi.svelte';
import type { Course, DayItem } from '$lib/types';
import { todayDate, dateLabel } from '$lib/calendarDates';
export { dateLabel, weekDates } from '$lib/calendarDates';
import {
	type FreePeriod,
	type MeetingPreferences,
	type PreviewClass,
	type PreviewSlot
} from './fixtures';

export function timeMinutes(value: string): number | undefined {
	const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
	if (!match) return undefined;
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (minutes > 59 || hours > 23) return undefined;
	if (match[3]) {
		if (hours < 1 || hours > 12) return undefined;
		hours = (hours % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
	}
	return hours * 60 + minutes;
}

export function minutesTime(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function dayClasses(date: string, selected: string[], source: PreviewClass[]) {
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
	source: PreviewClass[],
	bounds?: { start?: string; end?: string }
): { periods: FreePeriod[]; message?: string } {
	const duration = Number(preferences.duration);
	const buffer = Number(preferences.buffer);
	const dailyStart = timeMinutes(preferences.dailyStart);
	const dailyEnd = timeMinutes(preferences.dailyEnd);
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
	for (const date = new Date(from); date <= until; date.setUTCDate(date.getUTCDate() + 1)) {
		if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
		const dateString = date.toISOString().slice(0, 10);
		if (dateString < todayDate()) continue;
		const classes = dayClasses(dateString, selected, source);
		let start = dailyStart;
		let end = dailyEnd;
		if (preferences.betweenClasses) {
			if (!classes.length) continue;
			start = Math.max(start, Math.min(...classes.map((item) => timeMinutes(item.start)!)));
			end = Math.min(end, Math.max(...classes.map((item) => timeMinutes(item.end)!)));
		}
		const busy = mergeBusy(
			classes.map((item) => ({
				start: timeMinutes(item.start)! - buffer,
				end: timeMinutes(item.end)! + buffer
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

export function schedulingClasses(courses: Course[], personId = 'you'): PreviewClass[] {
	const days: DayItem['key'][] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
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
	if (!ui.hasSelectedFriends)
		return ui.friendsLoading ? 'Loading friends…' : 'Select some friends to plan together.';
	if (!term) return 'Loading the current term…';
	if (ui.selected.includes('you') && !ownCourses)
		return 'Your class schedule is not loaded for this term.';
	for (const id of ui.selected.filter((id) => id !== 'you')) {
		const status = ui.scheduleStatus[term]?.[id];
		const person = ui.friends.find((person) => person.id === id);
		if (!person) return 'Choose people from your current friends.';
		if (!status || status === 'loading') return `Loading ${person.name}'s schedule…`;
		if (status !== 'loaded')
			return status === 'unprocessed'
				? `${person.name} has not set up a class schedule for this term.`
				: `Could not load ${person.name}'s schedule. Try again.`;
	}
}

export function scheduleAvailability(
	ui: PanelUi,
	ownCourses?: Course[],
	preferences = ui.preferences
) {
	const message = scheduleMessage(ui, ownCourses);
	if (message) return { periods: [], message };
	const term = ui.scheduleTerm!;
	const source = [
		...schedulingClasses(ownCourses ?? []),
		...ui.selected
			.filter((id) => id !== 'you')
			.flatMap((id) => schedulingClasses(ui.friendSchedules[term]?.[id] ?? [], id))
	];
	return findFreePeriods(ui.selected, preferences, source, ui.termBounds[term]);
}

export function meetingMessage(
	ui: PanelUi,
	ownCourses: Course[] | undefined,
	slot: PreviewSlot
): string | undefined {
	const start = timeMinutes(slot.start);
	const end = timeMinutes(slot.end);
	if (start === undefined || end === undefined || start >= end)
		return 'Choose a valid start time and an end after it.';
	if (slot.date < todayDate()) return 'Choose today or a future date.';
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
		return 'This time overlaps a selected class or its buffer. Choose another time.';
}
