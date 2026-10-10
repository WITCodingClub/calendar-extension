import type { Course, TermResponse, Weekday } from '../types';
import { WEEKDAYS } from '../calendar/days';
import { CAMPUS_TIME_ZONE, timeMinutes, minutesTime } from '../datetime';

type RawFriendMeeting = {
	id?: number | string;
	begin_time: string;
	end_time: string;
	day_of_week?: string;
	start_date?: string | null;
	end_date?: string | null;
	monday?: boolean;
	tuesday?: boolean;
	wednesday?: boolean;
	thursday?: boolean;
	friday?: boolean;
	saturday?: boolean;
	sunday?: boolean;
	color?: string;
	title_overrides?: Partial<Record<Weekday, string>>;
	location?: {
		building?: {
			name?: string;
			abbreviation?: string;
		} | null;
		room?: string;
		rooms?: string[];
	};
};

type RawFriendCourse = {
	title: string;
	start_date?: string | null;
	end_date?: string | null;
	subject?: string;
	prefix?: string;
	course_number?: number | string;
	schedule_type?: string;
	professor?: {
		first_name?: string;
		last_name?: string;
		email?: string;
	} | null;
	term?: {
		start_date?: string | null;
		end_date?: string | null;
		uid?: number | string;
		season?: string;
		year?: number | string;
	};
	instructors?: Array<
		| string
		| {
				first_name?: string;
				last_name?: string;
				email?: string;
		  }
	>;
	meeting_times: RawFriendMeeting[];
};

export function mapFriendCourses(
	data: { processed_courses?: RawFriendCourse[]; classes?: RawFriendCourse[] },
	friendId: string
): Course[] {
	const processedCourses =
		data?.processed_courses !== undefined ? data.processed_courses : data?.classes;
	if (!Array.isArray(processedCourses)) throw new Error('No valid schedule array was returned.');
	validateCourses(processedCourses);
	const courses = processedCourses.map((c, ci: number) => {
		const firstInstructor = c.instructors?.[0];
		const professor =
			c.professor ??
			(typeof firstInstructor === 'string'
				? { first_name: firstInstructor, last_name: '', email: '' }
				: firstInstructor);
		return {
			title: c.title,
			prefix: c.subject ?? c.prefix ?? '',
			course_number: Number(c.course_number ?? 0),
			schedule_type: c.schedule_type ?? '',
			term: {
				uid: Number(c.term?.uid ?? 0),
				season: c.term?.season ?? '',
				year: Number(c.term?.year ?? 0)
			},
			professor: {
				first_name: professor?.first_name ?? '',
				last_name: professor?.last_name ?? '',
				email: professor?.email ?? ''
			},
			meeting_times: c.meeting_times.map((m, mi: number) => {
				const begin = minutesTime(timeMinutes(m.begin_time)!);
				const end = minutesTime(timeMinutes(m.end_time)!);
				const dayKey = String(m.day_of_week ?? '').toLowerCase() as Weekday;
				const hasDayFlags = WEEKDAYS.some((day) => m[day] !== undefined);
				const mappedRooms = m.location?.rooms;
				return {
					id: m.id ?? `${friendId}-${ci}-${mi}-${dayKey}`,
					begin_time: begin,
					end_time: end,
					start_date: m.start_date || c.start_date || c.term?.start_date || '',
					end_date: m.end_date || c.end_date || c.term?.end_date || '',
					location: {
						building: {
							name: m.location?.building?.name ?? '',
							abbreviation: m.location?.building?.abbreviation ?? ''
						},
						rooms: Array.isArray(mappedRooms)
							? mappedRooms
							: m.location?.room
								? [m.location.room]
								: []
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
		};
	});
	validateCourses(courses);
	return courses;
}

export function validDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
	const date = new Date(value.slice(0, 10) + 'T00:00:00Z');
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}

export function validateTermBounds(bounds: { start?: string | null; end?: string | null }): void {
	if (
		(bounds.start != null && bounds.start !== '' && !validDate(bounds.start)) ||
		(bounds.end != null && bounds.end !== '' && !validDate(bounds.end)) ||
		(bounds.start && bounds.end && bounds.start.slice(0, 10) > bounds.end.slice(0, 10))
	)
		throw new Error('Invalid term dates returned. Reload schedules to try again.');
}

export function validatedTerms(value: TermResponse): TermResponse {
	if (!value || (!value.current_term && !value.next_term))
		throw new Error('No planning term was returned.');
	for (const term of [value.current_term, value.next_term]) {
		if (term === null) continue;
		if (!term || !Number.isInteger(term.id) || term.id <= 0 || typeof term.name !== 'string')
			throw new Error('Invalid planning term returned.');
		validateTermBounds({ start: term.start_date, end: term.end_date });
	}
	return value;
}

export function validateCourses(value: unknown): void {
	if (!Array.isArray(value)) throw new Error('No valid schedule array was returned.');
	const ids = new Set<string>();
	for (const course of value) {
		if (!course || typeof course.title !== 'string' || !Array.isArray(course.meeting_times))
			throw new Error('Invalid class data returned.');
		for (const key of ['subject', 'prefix', 'schedule_type']) {
			if (course[key] !== undefined && typeof course[key] !== 'string')
				throw new Error('Invalid class details returned.');
		}
		if (course.term !== undefined && (!course.term || typeof course.term !== 'object'))
			throw new Error('Invalid class term returned.');
		if (
			course.professor != null &&
			(typeof course.professor !== 'object' || Array.isArray(course.professor))
		)
			throw new Error('Invalid class instructor returned.');
		if (
			course.instructors !== undefined &&
			(!Array.isArray(course.instructors) ||
				course.instructors.some((person: unknown) =>
					typeof person === 'string'
						? !person.trim()
						: !person || typeof person !== 'object' || Array.isArray(person)
				))
		)
			throw new Error('Invalid class instructors returned.');
		validateTermBounds({
			start: course.start_date === '' ? undefined : course.start_date,
			end: course.end_date === '' ? undefined : course.end_date
		});
		if (course.term)
			validateTermBounds({ start: course.term.start_date, end: course.term.end_date });
		for (const meeting of course.meeting_times) {
			if (
				!meeting ||
				typeof meeting.begin_time !== 'string' ||
				typeof meeting.end_time !== 'string'
			)
				throw new Error('Invalid class meeting returned.');
			if (meeting.id !== undefined) {
				if (
					!['string', 'number'].includes(typeof meeting.id) ||
					!String(meeting.id).trim() ||
					ids.has(String(meeting.id))
				)
					throw new Error('Invalid or duplicate class meeting ID returned.');
				ids.add(String(meeting.id));
			}
			if (
				meeting.day_of_week !== undefined &&
				(typeof meeting.day_of_week !== 'string' ||
					!WEEKDAYS.includes(meeting.day_of_week.toLowerCase()))
			)
				throw new Error('Invalid class meeting day returned.');
			const start = timeMinutes(meeting.begin_time);
			const end = timeMinutes(meeting.end_time);
			if (start === undefined || end === undefined || start >= end)
				throw new Error('Invalid class meeting time returned.');
			const flags = WEEKDAYS.filter((day) => meeting[day] !== undefined);
			if (
				flags.some((day) => typeof meeting[day] !== 'boolean') ||
				(flags.length
					? !flags.some((day) => meeting[day])
					: !WEEKDAYS.includes(meeting.day_of_week?.toLowerCase()))
			)
				throw new Error('Invalid class meeting days returned.');
			for (const key of ['start_date', 'end_date']) {
				if (meeting[key] != null && meeting[key] !== '' && !validDate(meeting[key]))
					throw new Error('Invalid class date returned.');
			}
			if (
				meeting.start_date &&
				meeting.end_date &&
				meeting.start_date.slice(0, 10) > meeting.end_date.slice(0, 10)
			)
				throw new Error('Class start date is after its end date.');
			if (
				meeting.location !== undefined &&
				(!meeting.location ||
					typeof meeting.location !== 'object' ||
					(meeting.location.rooms !== undefined &&
						(!Array.isArray(meeting.location.rooms) ||
							!meeting.location.rooms.every((room: unknown) => typeof room === 'string'))))
			)
				throw new Error('Invalid class location returned.');
		}
	}
}

export type BusyBlock = { date: string; weekday: string; start: string; end: string };
export type BusyBlocksResponse = {
	time_zone: string;
	start_date: string;
	end_date: string;
	busy: BusyBlock[];
};

export function busyRangeKey(from: string, until: string): string {
	return `${from}:${until}`;
}

export function validBusyRange(from: string, until: string): boolean {
	return (
		validDate(from) &&
		from.length === 10 &&
		validDate(until) &&
		until.length === 10 &&
		from <= until &&
		(Date.parse(until) - Date.parse(from)) / 86400000 < 120
	);
}

export function busyEndMinutes(value: string): number | undefined {
	return value === '24:00' ? 1440 : timeMinutes(value);
}

export function busyForRange(
	source: Record<string, Record<string, BusyBlocksResponse>>,
	id: string,
	from: string,
	until: string
): BusyBlocksResponse | undefined {
	return Object.values(source)
		.map((people) => people[id])
		.find((data) => data && data.start_date <= from && data.end_date >= until);
}

export function busyBlocks(value: unknown, from: string, until: string): BusyBlocksResponse {
	const data = value as BusyBlocksResponse | null;
	const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	if (
		!validBusyRange(from, until) ||
		!data ||
		data.time_zone !== CAMPUS_TIME_ZONE ||
		data.start_date !== from ||
		data.end_date !== until ||
		!Array.isArray(data.busy) ||
		!data.busy.every((block) => {
			if (
				!block ||
				!validDate(block.date) ||
				block.date.length !== 10 ||
				block.date < from ||
				block.date > until ||
				typeof block.start !== 'string' ||
				typeof block.end !== 'string' ||
				!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(block.start) ||
				!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(block.end)
			)
				return false;
			const start = timeMinutes(block.start);
			const end = busyEndMinutes(block.end);
			return (
				start !== undefined &&
				end !== undefined &&
				start < end &&
				block.weekday === weekdays[new Date(block.date + 'T00:00:00Z').getUTCDay()]
			);
		})
	)
		throw new Error('Invalid busy blocks returned. Reload schedules to try again.');
	return data;
}
