import { readStudentPage } from './academicProfile';

export const STUDENT_GRADES_URL =
	'https://selfservice.wit.edu/StudentSelfService/ssb/studentGrades';

export type CourseOutcome =
	| 'c_or_better'
	| 'passed_below_c'
	| 'failed'
	| 'withdrawn'
	| 'incomplete';
export type CourseOutcomes = {
	terms: { term: string; courses: { crn: string; outcome: CourseOutcome }[] }[];
};
export type CourseOutcomesResult = {
	terms: { term: string; updated: number; unknown_crns: string[] }[];
};
export type CollectedOutcomes = { outcomes: CourseOutcomes; warnings: string[] };

export async function lookupCourseOutcomes(): Promise<CollectedOutcomes | { error: string }> {
	try {
		const token = document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content');
		const deadline = Date.now() + 90_000;
		const load = async (path: string, read = false): Promise<unknown> => {
			if (Date.now() >= deadline) throw new Error('Loading course outcomes timed out. Try again.');
			const response = await fetch(`/StudentSelfService/studentGrades/${path}`, {
				credentials: 'include',
				signal: AbortSignal.timeout(15_000),
				headers: {
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			});
			if (
				response.status === 401 ||
				response.status === 403 ||
				response.redirected ||
				!response.headers.get('content-type')?.includes('application/json')
			)
				throw new Error('Please log in to LeopardWeb and try loading course outcomes again.');
			if (!response.ok)
				throw new Error(
					`LeopardWeb returned ${response.status} while loading course outcomes. Try again.`
				);
			if (read) return response.json();
			await response.body?.cancel();
		};
		await load(`term?filter=&page=1&max=10&_=${Date.now()}`);
		await load(`level?filter=&term=-1&page=1&max=10&_=${Date.now()}`);
		await load('gpa?term=-1&level=UG');
		const terms = new Map<string, Map<string, CourseOutcome>>();
		const unsupported = new Set<string>();
		const seen = new Set<string>();
		let offset = 0;
		let total: number | undefined;
		do {
			const body = await load(
				`courses?termCode=-1&levelCode=UG&filterText=&pageOffset=${offset}&pageMaxSize=10&sortColumn=-1&sortDirection=-1`,
				true
			);
			if (!body || typeof body !== 'object')
				throw new Error('LeopardWeb returned invalid course outcomes. Try again.');
			const page = body as Record<string, unknown>;
			if (
				page.success !== true ||
				!Array.isArray(page.data) ||
				!Number.isSafeInteger(page.totalCount) ||
				Number(page.totalCount) < 0 ||
				Number(page.totalCount) > 10_000 ||
				(total !== undefined && page.totalCount !== total) ||
				Number(page.pageOffset) !== offset
			)
				throw new Error('LeopardWeb returned incomplete course outcomes. Try again.');
			total = Number(page.totalCount);
			if (!page.data.length && offset < total)
				throw new Error('LeopardWeb stopped before all course outcomes loaded. Try again.');
			for (const value of page.data) {
				if (!value || typeof value !== 'object')
					throw new Error('LeopardWeb returned an invalid course. Try again.');
				const row = value as Record<string, unknown>;
				const term = String(row.termCode ?? '').trim();
				const crn = String(row.courseReferenceNumber ?? '').trim();
				if (!/^\d{6}$/.test(term) || !/^\d{1,10}$/.test(crn) || seen.has(`${term}:${crn}`))
					throw new Error('LeopardWeb returned invalid or repeated courses. Try again.');
				seen.add(`${term}:${crn}`);
				if (!terms.has(term)) terms.set(term, new Map());
				if (
					(row.finalGrade != null && typeof row.finalGrade !== 'string') ||
					(row.historyFinalGrade != null && typeof row.historyFinalGrade !== 'string')
				)
					throw new Error('LeopardWeb returned an invalid final grade. Try again.');
				const grade = (
					(row.historyFinalGrade as string | null | undefined)?.trim() ||
					(row.finalGrade as string | null | undefined)?.trim()
				)?.toUpperCase();
				if (!grade) continue;
				let outcome: CourseOutcome | undefined;
				if (/^(A[+-]?|B[+-]?|C\+?|P)$/.test(grade)) outcome = 'c_or_better';
				else if (/^(C-|D[+-]?)$/.test(grade)) outcome = 'passed_below_c';
				else if (grade === 'F') outcome = 'failed';
				else if (grade === 'W') outcome = 'withdrawn';
				else if (grade === 'I' || grade === 'IC') outcome = 'incomplete';
				if (outcome) terms.get(term)!.set(crn, outcome);
				else unsupported.add(term);
			}
			offset += page.data.length;
			if (offset > total)
				throw new Error('LeopardWeb returned an inconsistent course count. Try again.');
		} while (offset < total);
		return {
			outcomes: {
				terms: Array.from(terms)
					.filter(([term]) => !unsupported.has(term))
					.map(([term, courses]) => ({
						term,
						courses: Array.from(courses, ([crn, outcome]) => ({ crn, outcome }))
					}))
			},
			warnings: Array.from(
				unsupported,
				(term) =>
					`Skipped term ${term}: LeopardWeb returned an unsupported final grade. Its saved outcomes were preserved.`
			)
		};
	} catch (error) {
		return {
			error:
				error instanceof Error && error.name === 'Error'
					? error.message
					: 'Could not load all course outcomes from LeopardWeb. Check that you are logged in and try again.'
		};
	}
}

export function fetchCourseOutcomes(active: () => boolean): Promise<CollectedOutcomes | undefined> {
	return readStudentPage(STUDENT_GRADES_URL, lookupCourseOutcomes, active);
}
