import { fillId, isLab, unique, type DroppedCrn, type SectionPick } from './options';
import type { CatalogSection, PlanCourse, RegisteredCourse, SavedRegistrationPlan } from './types';

export type TermPicks = {
	added: string[];
	fills: Record<string, string>;
	picks: Record<string, SectionPick>;
	savedAt: string | null;
	base: string | null;
	dirty: boolean;
};

export function emptyPicks(): TermPicks {
	return { added: [], fills: {}, picks: {}, savedAt: null, base: null, dirty: false };
}

export function picksFrom(courses: PlanCourse[]): Pick<TermPicks, 'added' | 'fills' | 'picks'> {
	const seen: Record<string, number> = {};
	const fills: Record<string, string> = {};
	const picks: Record<string, SectionPick> = {};
	for (const course of courses) {
		if (course.crns.length)
			picks[course.code] = {
				lecture: course.crns[0],
				...(course.crns[1] ? { lab: course.crns[1] } : {})
			};
		if (!course.fills) continue;
		const key = `${course.fills.kind}:${course.fills.label}`;
		fills[course.code] = fillId(course.fills, seen[key] ?? 0);
		seen[key] = (seen[key] ?? 0) + 1;
	}
	return { added: unique(courses.map((course) => course.code)), fills, picks };
}

export function registeredCourses(
	registered: RegisteredCourse[],
	sections: CatalogSection[]
): PlanCourse[] {
	return registered.map((course) => {
		const lab = (crn: string) => {
			const section = sections.find((entry) => entry.crn === crn);
			return section ? isLab(section) : false;
		};
		const crns = [
			...course.crns.filter((crn) => !lab(crn)),
			...course.crns.filter((crn) => lab(crn))
		];
		return { code: course.code, crns, fills: null };
	});
}

export function withoutUnavailable(
	saved: SavedRegistrationPlan,
	term: string
): { courses: PlanCourse[]; dropped: DroppedCrn[] } {
	const { cancelled, not_found } = saved.schedule_check;
	const dropped: DroppedCrn[] = [];
	const courses = saved.courses.map((course) => {
		const crns = course.crns.filter((crn) => {
			const reason = cancelled.includes(crn)
				? 'cancelled'
				: not_found.includes(crn)
					? 'not_found'
					: null;
			if (reason) dropped.push({ term, code: course.code, crn, reason });
			return !reason;
		});
		return { ...course, crns: crns[0] === course.crns[0] ? crns : [] };
	});
	return { courses, dropped };
}
