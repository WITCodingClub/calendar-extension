import type {
	CatalogSection,
	DegreeProgram,
	DegreeProgress,
	NextTermCourses,
	NextTermRow,
	PlanTerm,
	ProgressStatus,
	RegistrationPlanBody,
	RequirementRow,
	ScheduleCheck,
	ScheduleOptionsRequest,
	SchedulePreferences
} from '../../src/lib/registration/types';

export class Reply {
	status: number;
	json: unknown;
	headers: Record<string, string>;
	constructor(status: number, json: unknown, headers: Record<string, string> = {}) {
		this.status = status;
		this.json = json;
		this.headers = headers;
	}
}

export type RegistrationState = {
	plans: Record<string, { body: RegistrationPlanBody; updated_at: string }>;
	puts: { term: string; body: RegistrationPlanBody }[];
	busy: number;
	zero: boolean;
	unpublished: boolean;
	fail: string[];
};

export function registrationState(): RegistrationState {
	return { plans: {}, puts: [], busy: 0, zero: false, unpublished: false, fail: [] };
}

export const REGISTRATION_PATH =
	/^\/api\/(?:user\/(degree_progress|next_term_courses|registration_plans)(?:\/(\d+))?|v1\/catalog\/(sections|schedule_check|schedule_options)(\/count)?)$/;
const REGISTERING = 202620;
const CURRENT = 202610;
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LETTERS: Record<string, string> = {
	M: 'monday',
	T: 'tuesday',
	W: 'wednesday',
	R: 'thursday',
	F: 'friday'
};

export function termUid(name: string) {
	const [season, year] = name.split(' ');
	const base = Number(year) * 100;
	return season === 'Fall' ? base + 10 : base - 100 + (season === 'Spring' ? 20 : 30);
}

function termName(uid: number) {
	const year = Math.floor(uid / 100);
	const season = uid % 100;
	return season === 10 ? `Fall ${year}` : `${season === 20 ? 'Spring' : 'Summer'} ${year + 1}`;
}

function planTermName(year: number, season: string) {
	if (season === 'fall') return `Fall ${2024 + year}`;
	return `${season === 'spring' ? 'Spring' : 'Summer'} ${2025 + year}`;
}

const COURSES: Record<string, [string, string]> = {
	'COMP 1000': ['Computer Science I', 'Programming with a high-level language.'],
	'COMP 1050': ['Computer Science II', 'Objects, recursion, and data structures.'],
	'COMP 2000': ['Data Structures', 'Lists, trees, hash tables, and graphs.'],
	'COMP 2100': ['Software Development', 'Team projects with version control and testing.'],
	'COMP 2280': ['Computer Organization', 'Data, assembly, memory, and the processor.'],
	'COMP 3100': ['Software Design', 'Design patterns and architecture.'],
	'COMP 3350': ['Algorithms', 'Designing and analyzing algorithms and graphs.'],
	'COMP 3450': ['Operating Systems', 'Processes, scheduling, memory, and file systems.'],
	'COMP 4960': ['Senior Project I', 'The first half of a team project.'],
	'COMP 4970': ['Senior Project II', 'The second half of the senior project.'],
	'MATH 1750': ['Calculus I', 'Limits, derivatives, and their applications.'],
	'MATH 2500': ['Probability and Statistics', 'Probability, distributions, and tests.'],
	'PHIL 2100': ['Ethics', 'Ethical theories applied to technology.'],
	'PHIL 4401': ['Ethics of Technology', 'Privacy, automation, and AI.']
};

function requirement(
	year: number,
	season: string,
	label: string,
	status: ProgressStatus,
	extra: Partial<RequirementRow> = {}
): RequirementRow {
	const code = COURSES[label] ? label : null;
	const term = planTermName(year, season);
	return {
		year,
		season,
		kind: code ? 'course' : 'placeholder',
		code,
		label: code ? COURSES[code][0] : label,
		title: code ? COURSES[code][0] : null,
		description: code ? COURSES[code][1] : null,
		credit_hours: 4,
		typically_offered: null,
		elective_list: null,
		list: null,
		hss_category: null,
		checkable: true,
		status,
		course: status === 'open' ? null : code,
		term: status === 'open' ? null : term,
		planned_term: term,
		planned_term_uid: termUid(term),
		behind: false,
		expected_term: term,
		expected_term_uid: termUid(term),
		moved: null,
		filled_course: null,
		...extra
	};
}

function moved(term: string, reason: RequirementRow['moved']): Partial<RequirementRow> {
	return { expected_term: term, expected_term_uid: termUid(term), moved: reason };
}

const csRequirements: RequirementRow[] = [
	requirement(1, 'fall', 'COMP 1000', 'done'),
	requirement(1, 'fall', 'MATH 1750', 'done'),
	requirement(1, 'spring', 'COMP 1050', 'done'),
	requirement(1, 'spring', 'Humanities Elective', 'done', {
		course: 'HUMN 1500',
		filled_course: {
			code: 'HUMN 1500',
			title: 'Introduction to Humanities',
			description: 'Reading and discussing major works of literature, art, and philosophy.',
			credit_hours: 4
		}
	}),
	requirement(2, 'fall', 'COMP 2000', 'in_progress'),
	requirement(2, 'fall', 'Social Science Elective', 'in_progress', { course: 'ECON 1200' }),
	requirement(2, 'fall', 'COMP 2280', 'open', { behind: true, ...moved('Spring 2027', 'behind') }),
	requirement(2, 'fall', 'MATH 2500', 'open', { behind: true, ...moved('Spring 2027', 'behind') }),
	requirement(2, 'spring', 'COMP 3350', 'open'),
	requirement(2, 'spring', 'COMP 3450', 'open'),
	requirement(2, 'spring', 'HSS Elective', 'open', {
		elective_list: 'HSS Electives',
		hss_category: 'Ethics'
	}),
	requirement(3, 'fall', 'COMP 3100', 'open'),
	requirement(3, 'fall', 'HSS Elective', 'open', { elective_list: 'HSS Electives' }),
	requirement(3, 'spring', 'Co-op Work Term I', 'open', { elective_list: 'Co-op' }),
	requirement(3, 'summer', 'COMP 2100', 'open'),
	requirement(3, 'summer', 'Free Elective', 'open', { elective_list: 'Free Electives' }),
	requirement(4, 'fall', 'COMP 4960', 'open'),
	requirement(4, 'spring', 'Co-op Work Term II', 'open', { elective_list: 'Co-op' }),
	requirement(4, 'summer', 'COMP 4970', 'open'),
	requirement(4, 'summer', 'Program Elective', 'open', {
		checkable: false,
		...moved('Fall 2029', 'load')
	})
];

const timeline: PlanTerm[] = [
	[1, 'fall', 'past'],
	[1, 'spring', 'past'],
	[2, 'fall', 'current'],
	[2, 'spring', 'registering'],
	[3, 'fall', 'future'],
	[3, 'spring', 'future'],
	[3, 'summer', 'future'],
	[4, 'fall', 'future'],
	[4, 'spring', 'future'],
	[4, 'summer', 'future'],
	[5, 'fall', 'future']
].map(([year, season, when]) => {
	const term = planTermName(year as number, season as string);
	return {
		term,
		uid: termUid(term),
		year: year as number,
		season: season as string,
		when: when as PlanTerm['when'],
		estimated: (year as number) >= 3,
		co_op: season === 'spring' && (year as number) >= 3,
		basis: when === 'past' || when === 'current' ? 'taken' : 'estimate'
	};
});

function counts(rows: RequirementRow[]) {
	const of = (status: ProgressStatus) => rows.filter((row) => row.status === status).length;
	return { done: of('done'), in_progress: of('in_progress'), open: of('open') };
}

const noCredits = {
	earned: 0,
	in_progress: 0,
	not_counted: { earned: 0, in_progress: 0, courses: [] }
};

const hssSlot = (term: string, hss_category: string | null) => ({
	label: 'HSS Elective',
	planned_term: term,
	planned_term_uid: termUid(term),
	hss_category
});

const computerScience: DegreeProgram = {
	program: 'computer-science-bs',
	status: 'active',
	name: 'Computer Science, B.S.',
	catalog_year: '2025-2026',
	needs_review: false,
	plan: 'Four Year Plan',
	plans: ['Four Year Plan'],
	counts: counts(csRequirements),
	summary: {
		total_credits: 132,
		school: 'School of Computing and Data Science',
		department: 'Computer Science',
		credits: { ...noCredits, earned: 24, in_progress: 8 },
		co_ops: { required: 2, done: 0 }
	},
	requirements: csRequirements,
	hss: {
		min_credits: 24,
		credits: 16,
		categories: [
			{ name: 'Humanities', checkable: true, status: 'done', course: 'HUMN 1500', hint: null },
			{
				name: 'Social Science',
				checkable: true,
				status: 'in_progress',
				course: 'ECON 1200',
				hint: { subject_codes: ['ECON', 'PSYC', 'SOCL'], courses: [] }
			},
			{
				name: 'Ethics',
				checkable: true,
				status: 'open',
				course: null,
				hint: { subject_codes: ['PHIL'], courses: ['PHIL 2100', 'PHIL 4401'] }
			}
		],
		english: { credits: 8, courses: ['ENGL 1100', 'ENGL 2100'] },
		courses: [
			{
				code: 'HUMN 1500',
				title: 'Humanities',
				credits: 4,
				status: 'done',
				category: 'Humanities'
			},
			{
				code: 'ECON 1200',
				title: 'Economics',
				credits: 4,
				status: 'in_progress',
				category: 'Social Science'
			}
		],
		open_slots: [hssSlot('Spring 2027', 'Ethics'), hssSlot('Fall 2027', null)]
	},
	start_term: 'Fall 2025',
	expected_end: { term: 'Fall 2029', estimated: true, plan_end: 'Summer 2029' },
	timeline,
	total_credits: 132,
	school: 'School of Computing and Data Science',
	lists: []
};

const minorRows: RequirementRow[] = ['Required Mathematics', 'Upper-level Mathematics'].map(
	(name) => ({
		kind: 'elective_list',
		label: name,
		elective_list: name,
		checkable: true,
		status: 'open',
		planned_term: null,
		planned_term_uid: null,
		behind: false
	})
);

const mathMinor: DegreeProgram = {
	program: 'mathematics-minor',
	status: 'planned',
	name: 'Mathematics Minor',
	catalog_year: '2026-2027',
	needs_review: false,
	plan: null,
	plans: [],
	counts: counts(minorRows),
	summary: {
		total_credits: 20,
		school: 'School of Sciences and Humanities',
		department: 'Mathematics',
		credits: { ...noCredits, earned: 4 },
		co_ops: { required: 0, done: 0 }
	},
	requirements: minorRows,
	hss: null,
	start_term: null,
	expected_end: null,
	timeline: [],
	total_credits: 20,
	school: 'School of Sciences and Humanities',
	lists: [
		{
			name: 'Required Mathematics',
			min_courses: 2,
			min_credits: null,
			notes: 'Take both.',
			checkable: true,
			courses: [
				{
					code: 'MATH 1750',
					title: null,
					status: 'done',
					term: 'Fall 2025',
					major_term: 'Fall 2025'
				},
				{ code: 'MATH 2500', title: null, status: 'open', term: null, major_term: 'Fall 2026' }
			]
		},
		{
			name: 'Upper-level Mathematics',
			min_courses: 1,
			min_credits: null,
			notes: 'Pick one at 2800 or above.',
			checkable: true,
			courses: [
				{ code: 'MATH 2860', title: 'Linear Algebra', status: 'open', term: null, major_term: null }
			]
		}
	],
	overlap: {
		shared: 2,
		extra: 1,
		slots: [
			{
				label: 'Free Elective',
				planned_term: 'Summer 2028',
				planned_term_uid: 202730,
				courses: ['MATH 2860']
			}
		],
		unplaced: 0,
		expected_end_with_minor: { term: 'Fall 2029', estimated: true }
	}
};

export const degreeProgress: DegreeProgress = {
	programs: [computerScience, mathMinor],
	courses: [],
	assumptions: []
};

function courseRow(year: number, season: string, code: string): NextTermRow {
	return {
		year,
		season,
		kind: 'course',
		code,
		label: COURSES[code][0],
		elective_list: null,
		list: null,
		hss_category: null,
		courses: [
			{
				code,
				title: COURSES[code][0],
				offered: true,
				prerequisites: 'met',
				missing: [],
				missing_in_plan: [],
				description: COURSES[code][1],
				credit_hours: 4,
				typically_offered: ['Fall', 'Spring']
			}
		]
	};
}

function candidate(code: string, open_seats: boolean) {
	return {
		code,
		title: COURSES[code][0],
		credits: 4,
		hss_category: 'Ethics',
		prerequisites: 'met' as const,
		missing: [],
		missing_in_plan: [],
		open_seats
	};
}

function nextTerm(uid: number, sections: boolean): NextTermCourses {
	const fall = uid === CURRENT;
	return {
		term: { uid, name: termName(uid) },
		assumed: { courses: [], from_plans: [] },
		sections,
		programs: [
			{
				program: 'computer-science-bs',
				name: 'Computer Science, B.S.',
				plan: 'Four Year Plan',
				start_term: 'Fall 2025',
				semester: { year: 2, season: fall ? 'fall' : 'spring' },
				planned: fall
					? [courseRow(2, 'fall', 'COMP 2280'), courseRow(2, 'fall', 'MATH 2500')]
					: [
							courseRow(2, 'spring', 'COMP 3350'),
							courseRow(2, 'spring', 'COMP 3450'),
							{
								year: 2,
								season: 'spring',
								kind: 'placeholder',
								code: null,
								label: 'HSS Elective',
								elective_list: 'HSS Electives',
								list: null,
								hss_category: 'Ethics',
								courses: [],
								candidates: [candidate('PHIL 2100', true), candidate('PHIL 4401', false)]
							}
						],
				behind: fall ? [] : [courseRow(2, 'fall', 'COMP 2280'), courseRow(2, 'fall', 'MATH 2500')]
			}
		],
		assumptions: []
	};
}

function section(
	code: string,
	number: string,
	crn: string,
	meeting: string,
	seats: [number, number],
	linked: string[][] = [],
	source: 'banner' | 'link_identifier' = 'banner'
): CatalogSection {
	const [subject, course] = code.split(' ');
	const [days, begin_time, end_time] = meeting.split(' ');
	const lab = number.startsWith('L');
	return {
		crn,
		pub_id: `crs_${crn}`,
		subject_code: subject,
		course_number: Number(course),
		section_number: number,
		course_code: `${code}-${number}`,
		title: lab ? `${COURSES[code][0]} Lab` : COURSES[code][0],
		schedule_type: lab ? 'Laboratory' : 'Lecture',
		credit_hours: lab ? 0 : 4,
		status: 'active',
		seats: { capacity: seats[0], available: seats[1] },
		waitlist: { capacity: seats[1] ? 0 : 5, available: 0 },
		linked: { required: linked.length > 0, source, options: linked, crns: linked.flat() },
		instructors: [{ name: 'Test Instructor', rmp: null }],
		meeting_times: [...days].map((day) => ({
			day: DAY_LETTERS[day],
			begin_time,
			end_time,
			location: { display: 'Test Hall 101' }
		}))
	};
}

export const sections: CatalogSection[] = [
	section('COMP 3350', '01', '20397', 'MW 09:00 10:15', [30, 11], [['20402'], ['20403']]),
	section('COMP 3350', '02', '20401', 'TR 10:00 11:15', [30, 6], [['20404']], 'link_identifier'),
	section('COMP 3350', 'L1', '20402', 'F 10:00 11:50', [20, 8], [['20397']]),
	section('COMP 3350', 'L2', '20403', 'W 13:00 14:50', [20, 3], [['20397']]),
	section('COMP 3350', 'L3', '20404', 'R 14:00 15:50', [20, 9], [['20401']], 'link_identifier'),
	section('COMP 3450', '01', '20431', 'TR 12:00 13:15', [28, 9]),
	section('COMP 3450', '02', '20432', 'MW 14:00 15:15', [28, 0]),
	section('COMP 2280', '01', '20210', 'MWF 11:00 11:50', [32, 14]),
	section('COMP 2280', '02', '20211', 'TR 15:30 16:45', [32, 2]),
	section('MATH 2500', '01', '20540', 'MW 10:30 11:45', [35, 7]),
	section('MATH 2500', '02', '20541', 'TR 08:00 09:15', [35, 20]),
	section('PHIL 2100', '01', '20610', 'MW 13:30 14:45', [30, 5]),
	section('PHIL 4401', '01', '20615', 'TR 11:00 12:15', [25, 0])
];

const codeOf = (entry: CatalogSection) => entry.course_code.split('-')[0];
const byCrn = (crn: string) => sections.find((entry) => entry.crn === crn);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function overlap(a: CatalogSection, b: CatalogSection) {
	for (const x of a.meeting_times)
		for (const y of b.meeting_times)
			if (
				x.day === y.day &&
				minutes(x.begin_time) < minutes(y.end_time) &&
				minutes(y.begin_time) < minutes(x.end_time)
			)
				return x.day;
	return null;
}

function totals(list: CatalogSection[]) {
	const meetings = list.flatMap((entry) => entry.meeting_times);
	const starts = meetings.map((meeting) => meeting.begin_time).sort();
	const ends = meetings.map((meeting) => meeting.end_time).sort();
	return {
		credit_hours: list.reduce((sum, entry) => sum + (entry.credit_hours ?? 0), 0),
		days: DAYS.filter((day) => meetings.some((meeting) => meeting.day === day)),
		earliest_start: starts[0] ?? null,
		latest_end: ends.at(-1) ?? null,
		meetings_before_nine: meetings.filter((meeting) => meeting.begin_time < '09:00').length
	};
}

function scheduleCheck(crns: string[]): ScheduleCheck {
	const found = crns.map(byCrn).filter((entry): entry is CatalogSection => Boolean(entry));
	const conflicts: ScheduleCheck['conflicts'] = [];
	found.forEach((a, index) =>
		found.slice(index + 1).forEach((b) => {
			const day = overlap(a, b);
			if (day)
				conflicts.push({
					crns: [a.crn, b.crn],
					day,
					times: [a, b].map((entry) => {
						const meeting = entry.meeting_times.find((m) => m.day === day)!;
						return `${meeting.begin_time}-${meeting.end_time}`;
					}) as [string, string]
				});
		})
	);
	return {
		sections: found,
		not_found: crns.filter((crn) => !byCrn(crn)),
		cancelled: [],
		conflicts,
		link_problems: [],
		duplicates: [],
		totals: totals(found)
	};
}

const RELAX: Record<string, string> = {
	day_off: 'Allow classes every weekday',
	earliest: 'Allow earlier classes',
	latest: 'Allow later classes',
	blocked: 'Allow blocked times',
	open_only: 'Include full sections'
};

function units(entry: ScheduleOptionsRequest['courses'][number], rules: SchedulePreferences) {
	if (entry.crns?.length) return [entry.crns.map((crn) => byCrn(crn)!)];
	const fits = (item: CatalogSection) =>
		(!rules.open_only || (item.seats.available ?? 0) > 0) &&
		item.meeting_times.every(
			(meeting) =>
				(!rules.earliest || meeting.begin_time >= rules.earliest) &&
				(!rules.latest || meeting.end_time <= rules.latest) &&
				!(Array.isArray(rules.day_off) && rules.day_off.includes(meeting.day))
		);
	return entry.codes
		.flatMap((code) =>
			sections
				.filter((item) => codeOf(item) === code && item.schedule_type === 'Lecture')
				.flatMap((lecture) =>
					lecture.linked.required
						? lecture.linked.options.map((option) => [lecture, ...option.map((crn) => byCrn(crn)!)])
						: [[lecture]]
				)
		)
		.filter((unit) => unit.every(fits));
}

function search(request: ScheduleOptionsRequest, rules: SchedulePreferences) {
	const offered = request.courses.filter((entry) =>
		entry.codes.some((code) => sections.some((item) => codeOf(item) === code))
	);
	const found: CatalogSection[][][] = [];
	const visit = (index: number, picked: CatalogSection[][]) => {
		if (index === offered.length) {
			const days = totals(picked.flat()).days;
			if (rules.day_off !== 'any' || days.length < DAYS.length) found.push(picked);
			return;
		}
		for (const unit of units(offered[index], rules))
			if (unit.every((item) => picked.flat().every((other) => !overlap(item, other))))
				visit(index + 1, [...picked, unit]);
	};
	visit(0, []);
	return found;
}

function hardRules(rules: SchedulePreferences) {
	return Object.keys(RELAX).filter((key) => {
		const value = rules[key as keyof SchedulePreferences];
		return value !== undefined && value !== false && value !== 'none';
	});
}

function countWith(
	state: RegistrationState,
	request: ScheduleOptionsRequest,
	rules: SchedulePreferences
) {
	return state.zero && hardRules(rules).length ? 0 : search(request, rules).length;
}

function scheduleOptions(state: RegistrationState, request: ScheduleOptionsRequest) {
	const rules = request.preferences ?? {};
	const count = countWith(state, request, rules);
	const schedules = count
		? search(request, rules)
				.map((picked) => ({ picked, crns: picked.flat().map((item) => item.crn) }))
				.sort((a, b) => a.crns.join().localeCompare(b.crns.join()))
				.slice(0, request.limit ?? 6)
		: [];
	return {
		term: { uid: request.term_uid, name: termName(request.term_uid) },
		count,
		capped: false,
		schedules: schedules.map(({ picked, crns }, index) => {
			const sum = totals(picked.flat());
			return {
				rank: index + 1,
				score: 1,
				crns,
				courses: picked.map((unit) => ({
					code: codeOf(unit[0]),
					crns: unit.map((item) => item.crn)
				})),
				highlights: DAYS.filter((day) => !sum.days.includes(day)).map(
					(day) => `${day[0].toUpperCase()}${day.slice(1)}s off`
				),
				avoid_hits: 0,
				totals: sum
			};
		}),
		relax: count
			? []
			: hardRules(rules)
					.map((preference) => ({
						preference,
						label: RELAX[preference],
						count: countWith(state, request, { ...rules, [preference]: undefined })
					}))
					.filter((option) => option.count > 0)
					.sort((a, b) => b.count - a.count),
		not_offered: request.courses
			.flatMap((entry) => entry.codes)
			.filter((code) => !sections.some((item) => codeOf(item) === code))
	};
}

function savedPlan(term: string, plan: RegistrationState['plans'][string]) {
	const crns = plan.body.courses.flatMap((course) => course.crns);
	return {
		term: { uid: Number(term), name: termName(Number(term)) },
		courses: plan.body.courses,
		preferences: plan.body.preferences,
		crns,
		updated_at: plan.updated_at,
		schedule_check: scheduleCheck(crns)
	};
}

function sectionPage(query: URLSearchParams) {
	const list = (key: string) => query.get(key)?.split(',') ?? null;
	const subject = query.get('subject');
	const numbers = list('course_number');
	const crns = list('crn');
	const words = query.get('q')?.toLowerCase();
	const data = sections.filter(
		(item) =>
			(!subject || item.subject_code === subject) &&
			(!numbers || numbers.includes(String(item.course_number))) &&
			(!crns || crns.includes(item.crn)) &&
			(!words || `${item.course_code} ${item.title}`.toLowerCase().includes(words))
	);
	const per_page = Number(query.get('per_page') ?? 25);
	return { data, meta: { page: 1, per_page, total_count: data.length, total_pages: 1 } };
}

function failed(state: RegistrationState, key: string) {
	const index = state.fail.indexOf(key);
	if (index < 0) return false;
	state.fail.splice(index, 1);
	return true;
}

export function registrationReply(
	state: RegistrationState,
	method: string,
	path: string,
	body: Record<string, unknown> | null,
	query: URLSearchParams
): Reply | undefined {
	const match = REGISTRATION_PATH.exec(path);
	if (!match) return undefined;
	const key = match[1] ?? match[3];
	if (failed(state, key)) return new Reply(503, { error: `${key} is unavailable` });
	const builder = key === 'schedule_options' && method === 'POST';
	if (builder && state.busy > 0) {
		state.busy -= 1;
		return new Reply(
			503,
			{ error: 'Busy', code: 'SCHEDULE_BUILDER_BUSY', retry_after: 0 },
			{ 'Retry-After': '0' }
		);
	}
	if (builder) {
		const result = scheduleOptions(state, body as ScheduleOptionsRequest);
		return new Reply(200, {
			data: match[4] ? { count: result.count, capped: result.capped } : result
		});
	}
	if (method === 'GET' && key === 'degree_progress') return new Reply(200, degreeProgress);
	if (method === 'GET' && key === 'next_term_courses') {
		const term = Number(query.get('term') ?? REGISTERING);
		if (term !== REGISTERING && term !== CURRENT)
			return new Reply(404, { error: 'Term not found', code: 'NOT_FOUND' });
		return new Reply(200, nextTerm(term, term === CURRENT || !state.unpublished));
	}
	if (key === 'registration_plans' && match[2]) {
		const term = match[2];
		if (method === 'PUT') {
			const plan = body as RegistrationPlanBody;
			state.puts.push({ term, body: plan });
			state.plans[term] = {
				body: plan,
				updated_at: `2026-10-06T16:${String(state.puts.length).padStart(2, '0')}:00Z`
			};
		} else if (method !== 'GET') return undefined;
		const plan = state.plans[term];
		return plan
			? new Reply(200, savedPlan(term, plan))
			: new Reply(404, { error: 'Registration plan not found', code: 'NOT_FOUND' });
	}
	if (method === 'GET' && key === 'sections') return new Reply(200, sectionPage(query));
	if (method === 'GET' && key === 'schedule_check')
		return new Reply(200, { data: scheduleCheck(query.get('crn')?.split(',') ?? []) });
	return undefined;
}
