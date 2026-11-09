import type { Course, FriendIdentity, MeetingTime, Weekday } from '../types';
import { dayFlags, WEEKDAYS } from '../calendar/days';
import { syntheticCourse } from '../calendar/layout';
import { CAMPUS_TIME_ZONE } from '../datetime';
import { record, timestamp } from './validate';

export type CalendarDestination = 'google' | 'microsoft' | 'ics';

const FREQUENCIES = ['one_time', 'daily', 'weekly', 'monthly'] as const;
const repeatUnits = { daily: 'day', weekly: 'week', monthly: 'month' } as const;

export function repeatLabel(meeting: Pick<SavedMeeting, 'frequency' | 'repeat_interval'>) {
	if (meeting.frequency === 'one_time') return 'Once';
	const interval = meeting.repeat_interval ?? 1;
	if (interval === 1) return meeting.frequency[0].toUpperCase() + meeting.frequency.slice(1);
	return `Every ${interval} ${repeatUnits[meeting.frequency]}s`;
}

const providerLabels: Record<string, string> = {
	google: 'Google Calendar',
	microsoft: 'Microsoft Calendar',
	ics: 'ICS feed'
};
export const providerLabel = (provider: string) => providerLabels[provider] ?? provider;

export type SavedMeeting = {
	id: string;
	title: string;
	location: string | null;
	start_time: string;
	end_time: string;
	time_zone: string;
	frequency: (typeof FREQUENCIES)[number];
	recurrence: string | null;
	repeat_interval?: number | null;
	repeat_days?: Weekday[];
	repeat_until: string | null;
	invite_friends: boolean;
	role: 'owner' | 'invitee';
	can_edit: boolean;
	can_delete: boolean;
	can_leave: boolean;
	owner: FriendIdentity;
	friends: FriendIdentity[];
	guest?: { name: string; email: string } | null;
	destinations: CalendarDestination[];
	publications: Array<{
		provider: CalendarDestination;
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

export type SavedMeetingSelection = { meeting: SavedMeeting; occurrence: SavedMeetingOccurrence };
export type SavedMeetingSelectionHandler = (
	meeting: SavedMeetingSelection['meeting'],
	occurrence: SavedMeetingSelection['occurrence']
) => void;

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
		value.time_zone === CAMPUS_TIME_ZONE &&
		FREQUENCIES.includes(value.frequency as SavedMeeting['frequency']) &&
		(value.recurrence === null || typeof value.recurrence === 'string') &&
		(value.repeat_interval === undefined ||
			value.repeat_interval === null ||
			(Number.isInteger(value.repeat_interval) && Number(value.repeat_interval) >= 1)) &&
		(value.repeat_days === undefined ||
			(Array.isArray(value.repeat_days) &&
				value.repeat_days.every((day) => WEEKDAYS.includes(day)))) &&
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
	if (!record(value) || !Array.isArray(value.meetings) || !Array.isArray(value.occurrences))
		throw new Error('Invalid saved meetings returned. Reload meetings to try again.');
	const unknown = value.meetings
		.filter(
			(item) => record(item) && !FREQUENCIES.includes(item.frequency as SavedMeeting['frequency'])
		)
		.map((item) => item.id);
	const meetings = value.meetings.filter((item) => !unknown.includes(item.id));
	if (!meetings.every(meeting) || new Set(meetings.map((item) => item.id)).size !== meetings.length)
		throw new Error('Invalid saved meetings returned. Reload meetings to try again.');
	const occurrences = value.occurrences.filter(
		(occurrence) => !record(occurrence) || !unknown.includes(occurrence.meeting_id)
	);
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
	return { ...value, meetings, occurrences } as SavedMeetingsResponse;
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
				...dayFlags(WEEKDAYS[index]),
				id: occurrence.id,
				begin_time: start,
				end_time: end,
				start_date: date,
				end_date: date,
				color: '#8e24aa',
				location: { building: { name: item.location ?? '', abbreviation: '' }, rooms: [] }
			};
			return [syntheticCourse(item.title, meetingTime)];
		});
	});
}
