import type { SavedMeetingSelection } from './savedMeetings';
import type { MinuteRange, Participant } from './types';
import type { CalendarGridEvent } from '$lib/calendar/layout';

export type ComparisonMode = 'group' | 'detailed';

export type ComparisonBlock = MinuteRange & {
	id: string;
	title?: string;
	location?: string;
	kind?: 'event' | 'buffer';
	course?: import('../types').Course;
	meeting?: import('../types').MeetingTime;
};
export type ComparisonPerson = Pick<Participant, 'id' | 'name' | 'sharing'> & {
	color?: string;
	days: Record<
		string,
		{
			status: 'ready' | 'loading' | 'missing' | 'error';
			blocks: ComparisonBlock[];
			message?: string;
		}
	>;
};
export type ComparisonOwnerStrip = {
	ownerId: string;
	name: string;
	color: string;
	intervals: MinuteRange[];
};
export type ComparisonGridEvent = CalendarGridEvent & {
	sharedOwners?: { ownerId: string; name: string; color: string }[];
	ownerStrips?: ComparisonOwnerStrip[];
	savedMeeting?: SavedMeetingSelection;
};
export type ComparisonPeriod = MinuteRange & { people: string[] };
export type ComparisonProposal = MinuteRange & {
	saved?: boolean;
	invite?: boolean;
	canConfirm?: boolean;
	title: string;
	date: string;
	message?: string;
};
