import type { FriendIdentity } from '../types';
import type { CalendarDestination, SavedMeeting, SavedMeetingInput } from './savedMeetings';

export type Participant = FriendIdentity & {
	sharing: 'Full schedule' | 'Availability only' | 'Sharing unavailable';
	expiry?: string;
};

export type FriendGroup = {
	id: string;
	name: string;
	members: string[];
	expires_at: string | null;
};
export type ScheduleClass = {
	id: string;
	personId: string;
	title: string;
	code: string;
	location: string;
	instructor: string;
	days: number[];
	start: string;
	end: string;
	startDate: string;
	endDate: string;
	excludedDates: string[];
};
export type MeetingPreferences = {
	preset: string;
	from: string;
	until: string;
	duration: string;
	dailyStart: string;
	dailyEnd: string;
	buffer: string;
	betweenClasses: boolean;
};
export type MinuteRange = { start: number; end: number };
export type FreePeriod = MinuteRange & { id: string; date: string; day: string };
export type PlannerSlot = Pick<FreePeriod, 'id' | 'date' | 'start' | 'end'>;
export type PlannerPreset = { id: string; label: string; from?: string; until?: string };
export type PlannerDraft = MinuteRange & {
	title: string;
	date: string;
	participantNames: string[];
	location?: string;
	frequency?: string;
	calendar?: string;
	invite?: boolean;
};
export type PreviewSlot = {
	id: string;
	date: string;
	day: string;
	start: string;
	end: string;
	window: string;
};

export type MeetingDraft = {
	period: FreePeriod;
	slot: PreviewSlot;
	title: string;
	location: string;
	destinations: CalendarDestination[];
	inviteFriends: boolean;
	frequency: SavedMeeting['frequency'];
	idempotencyKey: string;
	destinationDefaultsPending?: boolean;
	submission?: SavedMeetingInput;
	submitting?: boolean;
	error?: string;
};
