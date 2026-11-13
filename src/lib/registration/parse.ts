import { record, text } from '../friends/validate';
import type {
	CatalogSection,
	DegreeProgress,
	NextTermCourses,
	PlanCourse,
	SavedRegistrationPlan,
	ScheduleCheck,
	ScheduleCount,
	ScheduleOptionsResponse,
	SectionPage
} from './types';

function fail(kind: string): never {
	throw new Error(`Invalid ${kind} returned. Try again.`);
}

function int(value: unknown): value is number {
	return Number.isSafeInteger(value);
}

function strings(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function nullable(value: unknown, check: (value: unknown) => boolean): boolean {
	return value === null || check(value);
}

function crn(value: unknown, kind: string): string {
	if (int(value) && value >= 0) return String(value);
	if (typeof value === 'string' && /^\d{1,6}$/.test(value)) return String(Number(value));
	return fail(kind);
}

function crns(value: unknown, kind: string): string[] {
	if (!Array.isArray(value)) fail(kind);
	return value.map((entry) => crn(entry, kind));
}

function data(value: unknown, kind: string): Record<string, unknown> {
	if (!record(value) || !record(value.data)) fail(kind);
	return value.data;
}

function status(value: unknown): boolean {
	return value === 'done' || value === 'in_progress' || value === 'open';
}

function requirement(row: unknown): boolean {
	return (
		record(row) &&
		typeof row.kind === 'string' &&
		status(row.status) &&
		typeof row.checkable === 'boolean' &&
		typeof row.behind === 'boolean' &&
		nullable(row.planned_term, text) &&
		(row.filled_course === undefined ||
			nullable(row.filled_course, (v) => record(v) && text(v.code)))
	);
}

function planTerm(term: unknown): boolean {
	return (
		record(term) &&
		text(term.term) &&
		int(term.uid) &&
		nullable(term.year, int) &&
		typeof term.estimated === 'boolean' &&
		typeof term.co_op === 'boolean'
	);
}

function hss(value: unknown): boolean {
	return (
		value === null ||
		(record(value) &&
			int(value.credits) &&
			Array.isArray(value.categories) &&
			value.categories.every((category) => record(category) && text(category.name)) &&
			record(value.english) &&
			strings(value.english.courses) &&
			Array.isArray(value.courses) &&
			value.courses.every((course) => record(course) && text(course.code)) &&
			Array.isArray(value.open_slots))
	);
}

function overlap(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(record(value) &&
			int(value.shared) &&
			int(value.extra) &&
			int(value.unplaced) &&
			Array.isArray(value.slots) &&
			value.slots.every((slot) => record(slot) && strings(slot.courses)))
	);
}

function program(value: unknown): boolean {
	return (
		record(value) &&
		text(value.program) &&
		text(value.name) &&
		[null, 'active', 'planned'].includes(value.status as string) &&
		record(value.counts) &&
		record(value.summary) &&
		record(value.summary.credits) &&
		record(value.summary.co_ops) &&
		Array.isArray(value.requirements) &&
		value.requirements.every(requirement) &&
		Array.isArray(value.timeline) &&
		value.timeline.every(planTerm) &&
		nullable(value.expected_end, (end) => record(end) && text(end.term)) &&
		Array.isArray(value.lists) &&
		value.lists.every((list) => record(list) && text(list.name) && Array.isArray(list.courses)) &&
		hss(value.hss) &&
		overlap(value.overlap)
	);
}

export function degreeProgress(value: unknown): DegreeProgress {
	if (
		!record(value) ||
		!Array.isArray(value.programs) ||
		!value.programs.every(program) ||
		!Array.isArray(value.courses) ||
		!strings(value.assumptions)
	)
		fail('degree progress');
	return value as DegreeProgress;
}

function prerequisites(value: Record<string, unknown>): boolean {
	return (
		[null, 'met', 'not_met', 'unknown'].includes(value.prerequisites as string) &&
		strings(value.missing) &&
		strings(value.missing_in_plan)
	);
}

function nextRow(row: unknown): boolean {
	return (
		record(row) &&
		int(row.year) &&
		typeof row.season === 'string' &&
		typeof row.kind === 'string' &&
		nullable(row.code, text) &&
		nullable(row.label, (label) => typeof label === 'string') &&
		Array.isArray(row.courses) &&
		row.courses.every((course) => record(course) && text(course.code) && prerequisites(course)) &&
		(row.candidates === undefined ||
			(Array.isArray(row.candidates) &&
				row.candidates.every(
					(candidate) =>
						record(candidate) &&
						text(candidate.code) &&
						prerequisites(candidate) &&
						nullable(candidate.open_seats, (seats) => typeof seats === 'boolean')
				)))
	);
}

export function nextTermCourses(value: unknown): NextTermCourses {
	if (
		!record(value) ||
		!record(value.term) ||
		!nullable(value.term.uid, int) ||
		typeof value.sections !== 'boolean' ||
		!Array.isArray(value.programs) ||
		!value.programs.every(
			(entry) =>
				record(entry) &&
				text(entry.program) &&
				Array.isArray(entry.planned) &&
				entry.planned.every(nextRow) &&
				Array.isArray(entry.behind) &&
				entry.behind.every(nextRow)
		) ||
		!strings(value.assumptions)
	)
		fail('course plan');
	return value as NextTermCourses;
}

function seats(value: unknown): boolean {
	return record(value) && nullable(value.capacity, int) && nullable(value.available, (n) => int(n));
}

function section(value: unknown): CatalogSection {
	const kind = 'sections';
	if (
		!record(value) ||
		!text(value.course_code) ||
		!text(value.subject_code) ||
		!int(value.course_number) ||
		typeof value.schedule_type !== 'string' ||
		!seats(value.seats) ||
		!seats(value.waitlist) ||
		!record(value.linked) ||
		!Array.isArray(value.linked.options) ||
		!Array.isArray(value.instructors) ||
		!Array.isArray(value.meeting_times) ||
		!value.meeting_times.every(
			(meeting) => record(meeting) && text(meeting.day) && text(meeting.begin_time)
		)
	)
		fail(kind);
	return {
		...(value as CatalogSection),
		crn: crn(value.crn, kind),
		linked: {
			...(value.linked as CatalogSection['linked']),
			crns: crns(value.linked.crns, kind),
			options: value.linked.options.map((group) => crns(group, kind))
		}
	};
}

export function sectionPage(value: unknown): SectionPage {
	if (!record(value) || !Array.isArray(value.data) || !record(value.meta) || !int(value.meta.page))
		fail('sections');
	return { data: value.data.map(section), meta: value.meta as SectionPage['meta'] };
}

function check(value: unknown): ScheduleCheck {
	const kind = 'schedule check';
	if (
		!record(value) ||
		!Array.isArray(value.sections) ||
		!Array.isArray(value.conflicts) ||
		!Array.isArray(value.link_problems) ||
		!Array.isArray(value.duplicates) ||
		!record(value.totals) ||
		!strings(value.totals.days)
	)
		fail(kind);
	return {
		...(value as ScheduleCheck),
		sections: value.sections.map((entry) => {
			if (!record(entry) || !text(entry.course_code) || !Array.isArray(entry.meeting_times))
				fail(kind);
			return { ...(entry as ScheduleCheck['sections'][number]), crn: crn(entry.crn, kind) };
		}),
		not_found: crns(value.not_found, kind),
		cancelled: crns(value.cancelled, kind),
		conflicts: value.conflicts.map((entry) => {
			if (!record(entry) || !Array.isArray(entry.crns) || entry.crns.length !== 2) fail(kind);
			const [a, b] = crns(entry.crns, kind);
			return { ...(entry as ScheduleCheck['conflicts'][number]), crns: [a, b] };
		}),
		link_problems: value.link_problems.map((entry) => {
			if (!record(entry) || !Array.isArray(entry.partner_options)) fail(kind);
			return {
				...(entry as ScheduleCheck['link_problems'][number]),
				crn: crn(entry.crn, kind),
				partner_crns: crns(entry.partner_crns ?? [], kind),
				partner_options: entry.partner_options.map((group) => crns(group, kind))
			};
		}),
		duplicates: value.duplicates.map((entry) => {
			if (!record(entry)) fail(kind);
			return { ...(entry as ScheduleCheck['duplicates'][number]), crns: crns(entry.crns, kind) };
		})
	};
}

export function scheduleCheck(value: unknown): ScheduleCheck {
	return check(data(value, 'schedule check'));
}

export function scheduleOptions(value: unknown): ScheduleOptionsResponse {
	const kind = 'schedules';
	const body = data(value, kind);
	if (
		!int(body.count) ||
		typeof body.capped !== 'boolean' ||
		!Array.isArray(body.schedules) ||
		!Array.isArray(body.relax) ||
		!body.relax.every(
			(entry) => record(entry) && text(entry.preference) && text(entry.label) && int(entry.count)
		) ||
		!(body.not_offered === undefined || strings(body.not_offered))
	)
		fail(kind);
	return {
		...(body as ScheduleOptionsResponse),
		not_offered: (body.not_offered as string[] | undefined) ?? [],
		schedules: body.schedules.map((entry) => {
			if (
				!record(entry) ||
				!Array.isArray(entry.courses) ||
				!strings(entry.highlights) ||
				!record(entry.totals)
			)
				fail(kind);
			return {
				...(entry as ScheduleOptionsResponse['schedules'][number]),
				crns: crns(entry.crns, kind),
				courses: entry.courses.map((course) => {
					if (!record(course) || !text(course.code)) fail(kind);
					return { code: course.code, crns: crns(course.crns, kind) };
				})
			};
		})
	};
}

export function scheduleCount(value: unknown): ScheduleCount {
	const body = data(value, 'schedule count');
	if (!int(body.count) || typeof body.capped !== 'boolean') fail('schedule count');
	return { count: body.count, capped: body.capped };
}

function planCourse(value: unknown): PlanCourse {
	const kind = 'registration plan';
	if (!record(value) || !text(value.code)) fail(kind);
	const fills = value.fills;
	if (fills !== null && !(record(fills) && text(fills.kind) && text(fills.label))) fail(kind);
	return {
		code: value.code,
		crns: crns(value.crns, kind),
		fills: fills === null ? null : { kind: fills.kind as string, label: fills.label as string }
	};
}

export function savedPlan(value: unknown): SavedRegistrationPlan {
	const kind = 'registration plan';
	if (
		!record(value) ||
		!record(value.term) ||
		!int(value.term.uid) ||
		!Array.isArray(value.courses) ||
		!nullable(value.updated_at, text)
	)
		fail(kind);
	return {
		term: {
			uid: value.term.uid,
			name: typeof value.term.name === 'string' ? value.term.name : null
		},
		courses: value.courses.map(planCourse),
		preferences: record(value.preferences) ? value.preferences : {},
		crns: crns(value.crns, kind),
		updated_at: value.updated_at as string | null,
		schedule_check: check(value.schedule_check)
	};
}
