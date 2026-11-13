export type TermRef = { uid: number; name: string };

export type SeatCount = { capacity: number | null; available: number | null };

export type CatalogMeeting = {
	day: string;
	begin_time: string;
	end_time: string;
	location: { display: string | null } | null;
};

export type CatalogInstructor = {
	name: string;
	rmp: {
		avg_rating: number | null;
		avg_difficulty: number | null;
		num_ratings: number;
		would_take_again_percent: number | null;
	} | null;
};

export type CatalogSection = {
	crn: string;
	pub_id: string;
	term?: TermRef;
	subject_code: string;
	course_number: number;
	section_number: string;
	course_code: string;
	title: string;
	schedule_type: string;
	credit_hours: number | null;
	status: 'active' | 'cancelled';
	seats: SeatCount;
	waitlist: SeatCount;
	linked: {
		required: boolean;
		source: 'banner' | 'link_identifier';
		options: string[][];
		crns: string[];
	};
	instructors: CatalogInstructor[];
	meeting_times: CatalogMeeting[];
};

export type PageMeta = { page: number; per_page: number; total_count: number; total_pages: number };

export type SectionPage = { data: CatalogSection[]; meta: PageMeta };

export type SectionQuery = {
	term_uid: string | number;
	subject?: string;
	course_number?: Array<string | number>;
	crn?: string[];
	q?: string;
	page?: number;
	per_page?: number;
};

export type ScheduleTotals = {
	credit_hours: number;
	days: string[];
	earliest_start: string | null;
	latest_end: string | null;
	meetings_before_nine: number;
};

export type CheckedSection = {
	crn: string;
	course_code: string;
	title: string;
	schedule_type: string;
	credit_hours: number | null;
	meeting_times: { day: string; begin_time: string; end_time: string }[];
};

export type ScheduleCheck = {
	sections: CheckedSection[];
	not_found: string[];
	cancelled: string[];
	conflicts: { crns: [string, string]; day: string; times: [string, string] }[];
	link_problems: {
		crn: string;
		problem: 'missing_partner' | 'unverified_link';
		source: 'banner' | 'link_identifier';
		partner_crns: string[];
		partner_options: string[][];
		message: string;
	}[];
	duplicates: { course_code: string; crns: string[] }[];
	totals: ScheduleTotals;
};

export type TimeRange = { days?: string[]; after?: string; before?: string };

export type SchedulePreferences = {
	blocked?: TimeRange[];
	avoid?: TimeRange[];
	earliest?: string;
	latest?: string;
	day_off?: 'none' | 'any' | string[];
	open_only?: boolean;
	days?: 'fewer' | 'spread' | 'any';
	breaks?: 'tight' | 'lunch' | 'any';
};

export type ScheduleOptionsRequest = {
	term_uid: number;
	courses: { codes: string[]; crns?: string[] }[];
	preferences?: SchedulePreferences;
	limit?: number;
};

export type RelaxPreference = 'day_off' | 'earliest' | 'latest' | 'blocked' | 'open_only';

export type RelaxOption = { preference: RelaxPreference | string; label: string; count: number };

export type ScheduleOption = {
	rank: number;
	score: number;
	crns: string[];
	courses: { code: string; crns: string[] }[];
	highlights: string[];
	avoid_hits: number;
	totals: ScheduleTotals;
};

export type ScheduleOptionsResponse = {
	term: TermRef;
	count: number;
	capped: boolean;
	schedules: ScheduleOption[];
	relax: RelaxOption[];
	not_offered: string[];
};

export type ScheduleCount = { count: number; capped: boolean };
