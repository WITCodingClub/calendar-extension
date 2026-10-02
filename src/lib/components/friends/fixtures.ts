export type PreviewPerson = {
	id: string;
	name: string;
	sharing: 'Full schedule';
	expiry?: string;
};

export type PreviewGroup = { id: string; name: string; members: string[] };
export type PreviewClass = {
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
};
export type MeetingPreferences = {
	from: string;
	until: string;
	duration: string;
	dailyStart: string;
	dailyEnd: string;
	buffer: string;
	betweenClasses: boolean;
};
export type FreePeriod = { id: string; date: string; day: string; start: number; end: number };
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
};
