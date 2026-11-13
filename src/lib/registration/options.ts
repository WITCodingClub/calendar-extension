import { DAY_SHORT, minutes } from './builder';
import type {
	CatalogSection,
	ElectiveCandidate,
	NextTermCourse,
	NextTermCourses,
	NextTermRow,
	PlanFill,
	PrerequisiteStatus,
	RowKind,
	ScheduleOption,
	ScheduleTotals
} from './types';

export type CourseOption = {
	code: string;
	title: string;
	credits: number | null;
	offered: boolean | null;
	prerequisites: PrerequisiteStatus;
	missing: string[];
	missingInPlan: string[];
	description: string | null;
	typicallyOffered: string | null;
	hssCategory: string | null;
	openSeats: boolean | null;
};

export type Suggestion = {
	id: string;
	group: 'planned' | 'behind';
	kind: RowKind;
	label: string;
	reason: string;
	program: string;
	electiveList: string | null;
	hssCategory: string | null;
	row: NextTermRow;
	options: CourseOption[];
};

export type FinderItem = {
	id: string;
	label: string;
	detail: string;
	required: boolean;
	blocked: string | null;
	codes: string[];
};

export type SectionPick = { lecture?: string; lab?: string };

export type Candidate = {
	id: string;
	rank: number;
	score: number;
	crns: string[];
	picks: Record<string, { lecture: string; lab?: string }>;
	fills: Record<string, string>;
	codes: string[];
	sections: CatalogSection[];
	days: string[];
	start: string | null;
	end: string | null;
	credits: number;
	avoidHits: number;
	totals: ScheduleTotals;
	highlights: string[];
};

export type DroppedCrn = {
	term: string;
	code: string;
	crn: string;
	reason: 'not_found' | 'cancelled';
};

export function unique<T>(values: T[]): T[] {
	return values.filter((value, index) => values.indexOf(value) === index);
}

export function codeOf(section: { course_code: string }) {
	return section.course_code.split('-')[0];
}

export function isLab(section: { schedule_type: string }) {
	return /lab/i.test(section.schedule_type);
}

export function rowLabel(row: Pick<NextTermRow, 'label' | 'code' | 'kind'>) {
	return row.label ?? row.code ?? row.kind;
}

export function fillId(fill: PlanFill, occurrence: number) {
	return `${fill.kind}:${fill.label}:${occurrence}`;
}

export function fillOf(id: string): PlanFill | null {
	const match = /^([^:]+):(.+):(\d+)$/.exec(id);
	return match ? { kind: match[1], label: match[2] } : null;
}

function fromCourse(course: NextTermCourse): CourseOption {
	return {
		code: course.code,
		title: course.title ?? course.code,
		credits: course.credit_hours,
		offered: course.offered,
		prerequisites: course.prerequisites,
		missing: course.missing,
		missingInPlan: course.missing_in_plan,
		description: course.description,
		typicallyOffered: course.typically_offered?.length ? course.typically_offered.join(', ') : null,
		hssCategory: null,
		openSeats: null
	};
}

function fromCandidate(candidate: ElectiveCandidate): CourseOption {
	return {
		code: candidate.code,
		title: candidate.title ?? candidate.code,
		credits: candidate.credits,
		offered: true,
		prerequisites: candidate.prerequisites,
		missing: candidate.missing,
		missingInPlan: candidate.missing_in_plan,
		description: null,
		typicallyOffered: null,
		hssCategory: candidate.hss_category,
		openSeats: candidate.open_seats
	};
}

export function suggestionsOf(
	data: NextTermCourses,
	plannedTerm: (program: string, row: NextTermRow) => string | null = () => null
): Suggestion[] {
	const seen: Record<string, number> = {};
	return data.programs.flatMap((program) =>
		(['planned', 'behind'] as const).flatMap((group) =>
			program[group].map((row) => {
				const label = rowLabel(row);
				const key = `${row.kind}:${label}`;
				const occurrence = seen[key] ?? 0;
				seen[key] = occurrence + 1;
				const term = group === 'behind' ? plannedTerm(program.program, row) : null;
				return {
					id: fillId({ kind: row.kind, label }, occurrence),
					group,
					kind: row.kind,
					label,
					reason:
						group === 'planned'
							? 'Recommended for this term'
							: `From ${term ?? 'an earlier term'}. You didn't take it then.`,
					program: program.program,
					electiveList: row.elective_list,
					hssCategory: row.hss_category,
					row,
					options:
						row.kind === 'course' || !row.candidates
							? row.courses.map(fromCourse)
							: row.candidates.map(fromCandidate)
				};
			})
		)
	);
}

export function prerequisiteLabel(
	option: Pick<CourseOption, 'prerequisites' | 'missing' | 'missingInPlan'>
) {
	switch (option.prerequisites) {
		case 'met':
			return 'Prerequisites met';
		case 'not_met':
			if (option.missingInPlan.length) return `Take ${option.missingInPlan.join(', ')} first`;
			return option.missing.length ? `Needs ${option.missing.join(', ')}` : 'Prerequisites not met';
		case 'unknown':
			return 'Prerequisite needs a test score';
		default:
			return 'Prerequisites not checked';
	}
}

function blockedText(first: CourseOption | undefined, published: boolean) {
	if (first?.prerequisites === 'not_met')
		return first.missingInPlan.length
			? `Take ${first.missingInPlan.join(', ')} first`
			: `Needs ${first.missing.join(', ')} first`;
	if (!first) return published ? 'No matching courses this term' : 'Not offered this term';
	return 'Not offered this term';
}

export function finderItemsOf(suggestions: Suggestion[], published: boolean): FinderItem[] {
	return suggestions.map((suggestion) => {
		const usable = suggestion.options.filter(
			(entry) => entry.offered !== false && entry.prerequisites !== 'not_met'
		);
		const first = suggestion.options[0];
		return {
			id: suggestion.id,
			label:
				suggestion.kind === 'course' && first ? `${first.code} · ${first.title}` : suggestion.label,
			detail:
				suggestion.kind === 'placeholder'
					? `Tries ${usable.map((entry) => entry.code).join(', ')}`
					: suggestion.kind === 'choice'
						? `Tries ${usable.map((entry) => entry.code).join(' or ')}`
						: suggestion.group === 'behind'
							? suggestion.reason
							: 'Recommended for this term',
			required: suggestion.group === 'planned',
			blocked: usable.length ? null : blockedText(first, published),
			codes: usable.map((entry) => entry.code)
		};
	});
}

export function candidateOf(
	schedule: ScheduleOption,
	items: Pick<FinderItem, 'id' | 'codes'>[],
	section: (crn: string) => CatalogSection | undefined
): Candidate {
	const sections = schedule.crns
		.map(section)
		.filter((entry): entry is CatalogSection => Boolean(entry));
	const picks: Candidate['picks'] = {};
	const fills: Candidate['fills'] = {};
	for (const course of schedule.courses) {
		const found = course.crns.map((crn) => section(crn));
		const lecture = course.crns.find((crn, index) => !found[index] || !isLab(found[index]!));
		const lab = course.crns.find(
			(crn, index) => crn !== lecture && found[index] && isLab(found[index]!)
		);
		picks[course.code] = { lecture: lecture ?? course.crns[0], ...(lab ? { lab } : {}) };
		const item = items.find((entry) => entry.codes.includes(course.code));
		if (item) fills[course.code] = item.id;
	}
	return {
		id: schedule.crns.join('-'),
		rank: schedule.rank,
		score: schedule.score,
		crns: schedule.crns,
		picks,
		fills,
		codes: schedule.courses.map((course) => course.code),
		sections,
		days: schedule.totals.days,
		start: schedule.totals.earliest_start,
		end: schedule.totals.latest_end,
		credits: schedule.totals.credit_hours,
		avoidHits: schedule.avoid_hits,
		totals: schedule.totals,
		highlights: schedule.highlights
	};
}

export function sectionsConflict(a: CatalogSection, b: CatalogSection) {
	return a.meeting_times.some((x) =>
		b.meeting_times.some(
			(y) =>
				x.day === y.day &&
				minutes(x.begin_time) < minutes(y.end_time) &&
				minutes(y.begin_time) < minutes(x.end_time)
		)
	);
}

export function conflictText(codes: [string, string], day: string) {
	return `${codes[0]} and ${codes[1]} overlap on ${DAY_SHORT[day] ?? day}`;
}

export function droppedMessage(dropped: DroppedCrn[]) {
	if (!dropped.length) return '';
	const cancelled = dropped.filter((entry) => entry.reason === 'cancelled');
	const missing = dropped.filter((entry) => entry.reason === 'not_found');
	const list = (entries: DroppedCrn[]) =>
		entries.map((entry) => `${entry.code} (${entry.crn})`).join(', ');
	return [
		cancelled.length ? `Removed cancelled sections: ${list(cancelled)}.` : '',
		missing.length ? `Removed sections that no longer exist: ${list(missing)}.` : '',
		'Pick new sections before you register.'
	]
		.filter(Boolean)
		.join(' ');
}
