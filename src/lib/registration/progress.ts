import iconDone from '@ktibow/iconset-material-symbols/check-circle';
import iconNow from '@ktibow/iconset-material-symbols/pending-outline';
import iconScheduled from '@ktibow/iconset-material-symbols/event-available-outline';
import iconBehind from '@ktibow/iconset-material-symbols/error-outline';
import iconTodo from '@ktibow/iconset-material-symbols/add-circle-outline';
import iconLater from '@ktibow/iconset-material-symbols/circle-outline';
import type { CourseOption } from './options';
import type { DegreeProgram, HssProgress, PlanTerm, ProgramOverlap, RequirementRow } from './types';

export type Kind = 'done' | 'now' | 'scheduled' | 'behind' | 'todo' | 'later';

export const KINDS: Record<Kind, { label: string; icon: typeof iconDone }> = {
	done: { label: 'Done', icon: iconDone },
	now: { label: 'Taking now', icon: iconNow },
	scheduled: { label: 'In your schedule', icon: iconScheduled },
	behind: { label: 'Not taken when planned', icon: iconBehind },
	todo: { label: 'Not in your schedule yet', icon: iconTodo },
	later: { label: 'Later', icon: iconLater }
};

export type ScheduleLookup = {
	scheduledIn(row: RequirementRow): { term: string; uid: string; code: string } | null;
	scheduled(row: RequirementRow): string | null;
	option(
		code: string,
		uid?: string
	): Pick<CourseOption, 'title' | 'description' | 'credits' | 'hssCategory'>;
};

export type TermEntry = PlanTerm & { rows: RequirementRow[] };

export function termOfRow(row: RequirementRow) {
	return row.expected_term ?? row.planned_term;
}

export function termsOf(
	program: DegreeProgram,
	plan?: Pick<ScheduleLookup, 'scheduledIn'>
): TermEntry[] {
	const termFor = (row: RequirementRow) => plan?.scheduledIn(row)?.term ?? termOfRow(row);
	return program.timeline.map((term) => ({
		...term,
		rows: program.requirements.filter((row) => termFor(row) === term.term)
	}));
}

export function kindOf(
	plan: Pick<ScheduleLookup, 'scheduled'>,
	row: RequirementRow,
	term: PlanTerm
): Kind {
	if (row.status === 'done') return 'done';
	if (row.status === 'in_progress') return 'now';
	if (plan.scheduled(row)) return 'scheduled';
	if (row.behind) return 'behind';
	if (term.when === 'registering') return 'todo';
	return 'later';
}

export function shortLabel(row: RequirementRow) {
	if (row.code) return row.code;
	if (row.kind === 'choice') {
		const subjects = [...new Set((row.options ?? []).map((code) => code.split(' ')[0]))];
		return subjects.length === 1 ? `${subjects[0]} choice` : 'Choice';
	}
	return (row.label ?? '').replace(' Elective', ' elective').replace(' Semester', '');
}

export function chipLabel(plan: Pick<ScheduleLookup, 'scheduled'>, row: RequirementRow) {
	if (row.code) return row.code;
	return row.filled_course?.code ?? row.course ?? plan.scheduled(row) ?? shortLabel(row);
}

export function title(row: RequirementRow) {
	return row.code ? `${row.code} · ${row.title ?? row.label ?? row.code}` : (row.label ?? '');
}

const NO_LIST = "Your plan doesn't list which courses count here. Ask your advisor.";

export function explain(
	plan: ScheduleLookup,
	row: RequirementRow,
	term: PlanTerm,
	hss?: HssProgress | null
) {
	const kind = kindOf(plan, row, term);
	const scheduled = row.code ? null : plan.scheduledIn(row);
	const filled = row.code
		? null
		: (row.filled_course?.code ?? row.course ?? scheduled?.code ?? null);
	const picked =
		scheduled && !row.filled_course ? plan.option(scheduled.code, scheduled.uid) : null;
	const filledTitle = row.filled_course?.title ?? picked?.title ?? null;
	const credits = row.filled_course?.credit_hours ?? picked?.credits ?? row.credit_hours ?? null;
	const category = filled
		? (hss?.courses.find((course) => course.code === filled)?.category ??
			picked?.hssCategory ??
			null)
		: null;
	const warning =
		filled && row.hss_category && category && category !== row.hss_category
			? `Your major still needs ${row.hss_category}. ${filled} counts as ${category}, so pick an ${row.hss_category} course here or in a later HSS elective.`
			: null;
	return {
		kind,
		title: filled && filledTitle ? `${filled} · ${filledTitle}` : title(row),
		text:
			row.filled_course?.description ??
			picked?.description ??
			row.description ??
			row.list?.notes ??
			(row.checkable ? '' : NO_LIST),
		meta: [
			filled && row.kind !== 'choice' ? `Counts as ${row.label}` : null,
			credits ? `${credits} credits` : null
		]
			.filter(Boolean)
			.join(' · '),
		warning
	};
}

export function missedByTerm(program: DegreeProgram) {
	const groups: { term: string | null; rows: RequirementRow[] }[] = [];
	for (const row of program.requirements.filter((entry) => entry.behind)) {
		const group = groups.find((entry) => entry.term === row.planned_term);
		if (group) group.rows.push(row);
		else groups.push({ term: row.planned_term, rows: [row] });
	}
	return groups;
}

export function sortedPrograms(programs: DegreeProgram[]) {
	return [
		...programs.filter((program) => program.status === 'active'),
		...programs.filter((program) => program.status !== 'active')
	];
}

function termIndex(name: string) {
	const [season, year] = name.split(' ');
	const offset = { spring: 0, summer: 0.5, fall: 1 }[season?.toLowerCase() ?? ''];
	return offset === undefined || !Number.isInteger(Number(year)) ? null : Number(year) * 2 + offset;
}

export function extraTerms(
	majorEnd: string | null | undefined,
	minorEnd: string | null | undefined
) {
	const from = majorEnd ? termIndex(majorEnd) : null;
	const to = minorEnd ? termIndex(minorEnd) : null;
	return from === null || to === null ? 0 : Math.max(0, Math.floor(to) - Math.floor(from));
}

export function majorEnd(programs: DegreeProgram[]) {
	const ends = programs
		.filter(
			(program) => program.status === 'active' && program.timeline.length && program.expected_end
		)
		.map((program) => program.expected_end!.term);
	return ends.reduce<string | null>((latest, term) => {
		if (latest === null) return term;
		return (termIndex(term) ?? 0) > (termIndex(latest) ?? 0) ? term : latest;
	}, null);
}

export function fitsIn(overlap: ProgramOverlap | null | undefined, programs: DegreeProgram[] = []) {
	if (!overlap?.slots.length) return null;
	const terms = [
		...new Set(
			overlap.slots.map((slot) => slot.planned_term).filter((term): term is string => !!term)
		)
	];
	if (!terms.length) return null;
	const extra =
		overlap.unplaced > 0
			? extraTerms(majorEnd(programs), overlap.expected_end_with_minor?.term)
			: 0;
	const more = extra ? ` +${extra} more ${extra === 1 ? 'term' : 'terms'}` : '';
	return { terms, extra, text: `${terms.join(', ')}${more}` };
}
