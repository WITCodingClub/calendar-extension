import type { Course, FriendIdentity, MeetingTime } from './types';
import { shiftDate } from './calendarDates';

export type SavedMeeting = {
	id: string;
	title: string;
	location: string | null;
	start_time: string;
	end_time: string;
	time_zone: string;
	frequency: 'one_time' | 'weekly';
	recurrence: string | null;
	repeat_until: string | null;
	invite_friends: boolean;
	role: 'owner' | 'invitee';
	can_edit: boolean;
	can_delete: boolean;
	can_leave: boolean;
	owner: FriendIdentity;
	friends: FriendIdentity[];
	guest?: { name: string; email: string } | null;
	destinations: Array<'google' | 'microsoft' | 'ics'>;
	publications: Array<{
		provider: 'google' | 'microsoft' | 'ics';
		status: 'queued' | 'published' | 'failed' | 'removed';
		invitation_status: 'not_requested' | 'queued' | 'sent' | 'cancelled' | 'failed';
	}>;
};

export type SavedMeetingOccurrence = {
	id: string;
	meeting_id: string;
	start_time: string;
	end_time: string;
};

export type SavedMeetingsResponse = {
	meetings: SavedMeeting[];
	occurrences: SavedMeetingOccurrence[];
};

export type SavedMeetingChanges = Partial<
	Pick<SavedMeeting, 'title' | 'location' | 'start_time' | 'end_time'>
>;

export type SavedMeetingInput = {
	title: string;
	location?: string | null;
	start_time: string;
	end_time: string;
	friend_ids: string[];
	frequency?: SavedMeeting['frequency'];
	invite_friends?: boolean;
	destinations?: SavedMeeting['destinations'];
};

function record(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
		Number.isFinite(Date.parse(value))
	);
}

function person(value: unknown): boolean {
	return (
		record(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string'
	);
}

function meeting(value: unknown): value is SavedMeeting {
	if (!record(value)) return false;
	return (
		typeof value.id === 'string' &&
		!!value.id &&
		typeof value.title === 'string' &&
		!!value.title.trim() &&
		(value.location === null || typeof value.location === 'string') &&
		timestamp(value.start_time) &&
		timestamp(value.end_time) &&
		Date.parse(value.end_time) > Date.parse(value.start_time) &&
		value.time_zone === 'America/New_York' &&
		['one_time', 'weekly'].includes(String(value.frequency)) &&
		(value.recurrence === null || typeof value.recurrence === 'string') &&
		(value.repeat_until === null ||
			(typeof value.repeat_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.repeat_until))) &&
		typeof value.invite_friends === 'boolean' &&
		['owner', 'invitee'].includes(String(value.role)) &&
		typeof value.can_edit === 'boolean' &&
		typeof value.can_delete === 'boolean' &&
		typeof value.can_leave === 'boolean' &&
		(value.role !== 'owner' || !value.can_leave) &&
		(value.role === 'owner' || (!value.can_edit && !value.can_delete)) &&
		person(value.owner) &&
		Array.isArray(value.friends) &&
		value.friends.every(person) &&
		(value.guest === undefined ||
			value.guest === null ||
			(record(value.guest) &&
				typeof value.guest.name === 'string' &&
				typeof value.guest.email === 'string')) &&
		Array.isArray(value.destinations) &&
		value.destinations.every((provider) => ['google', 'microsoft', 'ics'].includes(provider)) &&
		Array.isArray(value.publications) &&
		value.publications.every(
			(publication) =>
				record(publication) &&
				['google', 'microsoft', 'ics'].includes(String(publication.provider)) &&
				['queued', 'published', 'failed', 'removed'].includes(String(publication.status)) &&
				['not_requested', 'queued', 'sent', 'cancelled', 'failed'].includes(
					String(publication.invitation_status)
				)
		)
	);
}

export function savedMeetingResponse(value: unknown): { meeting: SavedMeeting } {
	if (!record(value) || !meeting(value.meeting))
		throw new Error('Invalid saved meeting returned. Reload meetings to try again.');
	return { meeting: value.meeting };
}

export function savedMeetings(value: unknown): SavedMeetingsResponse {
	if (
		!record(value) ||
		!Array.isArray(value.meetings) ||
		!value.meetings.every(meeting) ||
		new Set(value.meetings.map((item) => item.id)).size !== value.meetings.length ||
		!Array.isArray(value.occurrences)
	)
		throw new Error('Invalid saved meetings returned. Reload meetings to try again.');
	const meetings = value.meetings;
	const occurrences = value.occurrences;
	if (
		!occurrences.every(
			(occurrence) =>
				record(occurrence) &&
				typeof occurrence.id === 'string' &&
				!!occurrence.id &&
				meetings.some((item: SavedMeeting) => item.id === occurrence.meeting_id) &&
				timestamp(occurrence.start_time) &&
				timestamp(occurrence.end_time) &&
				Date.parse(occurrence.end_time) > Date.parse(occurrence.start_time)
		) ||
		new Set(occurrences.map((item) => item.id)).size !== occurrences.length
	)
		throw new Error('Invalid saved meetings returned. Reload meetings to try again.');
	return value as SavedMeetingsResponse;
}

export function savedMeetingCourses(data: SavedMeetingsResponse, dates: string[]): Course[] {
	return data.occurrences.flatMap((occurrence) => {
		const item = data.meetings.find((meeting) => meeting.id === occurrence.meeting_id)!;
		return dates.flatMap((date, index) => {
			const first = occurrence.start_time.slice(0, 10);
			const last = occurrence.end_time.slice(0, 10);
			if (date < first || date > last) return [];
			const start = date === first ? occurrence.start_time.slice(11, 16) : '00:00';
			const end = date === last ? occurrence.end_time.slice(11, 16) : '24:00';
			if (start === end) return [];
			const meetingTime: MeetingTime = {
				monday: index === 0,
				tuesday: index === 1,
				wednesday: index === 2,
				thursday: index === 3,
				friday: index === 4,
				saturday: index === 5,
				sunday: index === 6,
				id: occurrence.id,
				begin_time: start,
				end_time: end,
				start_date: date,
				end_date: date,
				color: '#8e24aa',
				location: { building: { name: item.location ?? '', abbreviation: '' }, rooms: [] }
			};
			return [
				{
					title: item.title,
					prefix: '',
					course_number: 0,
					schedule_type: '',
					term: { uid: 0, season: '', year: 0 },
					professor: { first_name: '', last_name: '', email: '' },
					meeting_times: [meetingTime]
				}
			];
		});
	});
}

export function savedMeetingOverlaps(meeting: SavedMeeting, start: string, end: string): boolean {
	const first = meeting.start_time.slice(0, 10);
	let last = meeting.end_time.slice(0, 10);
	if (meeting.frequency === 'weekly' && meeting.repeat_until) {
		const days = (Date.parse(meeting.repeat_until) - Date.parse(first)) / 86400000;
		const endDays = (Date.parse(last) - Date.parse(first)) / 86400000;
		last = shiftDate(meeting.repeat_until, -(days % 7) + endDays);
	}
	if (meeting.end_time.slice(11, 19) !== '00:00:00') last = shiftDate(last, 1);
	return first < end && last > start;
}
