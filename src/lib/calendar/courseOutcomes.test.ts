import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lookupCourseOutcomes } from './courseOutcomes';

const fetchMock = vi.fn();
function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
function course(crn: number, finalGrade: string | null, extra: Record<string, unknown> = {}) {
	return { courseReferenceNumber: String(crn), termCode: '202620', finalGrade, ...extra };
}
function setup(courses: ReturnType<typeof course>[], pageSize = 10) {
	fetchMock.mockImplementation(async (path: string) => {
		const url = new URL(path, 'https://selfservice.wit.edu');
		if (!url.pathname.endsWith('/courses'))
			return json({ private: 'GPA must never be read or sent' });
		const offset = Number(url.searchParams.get('pageOffset'));
		return json({
			success: true,
			data: courses.slice(offset, offset + pageSize),
			totalCount: courses.length,
			pageOffset: String(offset),
			pageMaxSize: '10'
		});
	});
}
beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubGlobal('document', { querySelector: () => ({ getAttribute: () => 'csrf-test' }) });
});
afterEach(() => vi.unstubAllGlobals());

it('initializes in order and converts final grades across every course page', async () => {
	const grades = [
		['A', 'c_or_better'],
		['A-', 'c_or_better'],
		['B+', 'c_or_better'],
		['B-', 'c_or_better'],
		['C', 'c_or_better'],
		['P', 'c_or_better'],
		['C-', 'passed_below_c'],
		['D+', 'passed_below_c'],
		['D', 'passed_below_c'],
		['D-', 'passed_below_c'],
		['F', 'failed'],
		['W', 'withdrawn'],
		['I', 'incomplete'],
		['IC', 'incomplete']
	];
	setup(grades.map(([grade], index) => course(index + 1, grade)));
	expect(await lookupCourseOutcomes()).toEqual({
		outcomes: {
			terms: [
				{
					term: '202620',
					courses: grades.map(([, outcome], index) => ({ crn: String(index + 1), outcome }))
				}
			]
		},
		warnings: []
	});
	expect(
		fetchMock.mock.calls.map(([path]) =>
			new URL(path, 'https://selfservice.wit.edu').pathname.split('/').at(-1)
		)
	).toEqual(['term', 'level', 'gpa', 'courses', 'courses']);
	expect(fetchMock.mock.calls[4][0]).toContain('pageOffset=10');
	expect(fetchMock.mock.calls[0][1]).toMatchObject({
		credentials: 'include',
		headers: { 'X-Synchronizer-Token': 'csrf-test' }
	});
});

it('prefers corrected historical grades and returns only safe final outcomes', async () => {
	setup([
		course(1, 'IC', { historyFinalGrade: ' B- ', calculatedFinalGrade: 'F', midtermGrade: 'F' }),
		course(2, null, {
			historyFinalGrade: 'C',
			studentPidm: 'private',
			gpa: 'private',
			qualityPoints: 'private',
			w_number: 'private'
		}),
		course(3, null, { midtermGrade: 'F', calculatedFinalGrade: 'A' })
	]);
	expect(await lookupCourseOutcomes()).toEqual({
		outcomes: {
			terms: [
				{
					term: '202620',
					courses: [
						{ crn: '1', outcome: 'c_or_better' },
						{ crn: '2', outcome: 'c_or_better' }
					]
				}
			]
		},
		warnings: []
	});
});

it('omits an entire term with unsupported grades to preserve its stored outcomes', async () => {
	setup([course(1, 'B-'), course(2, 'UNRECOGNIZED'), course(3, 'F', { termCode: '202610' })]);
	expect(await lookupCourseOutcomes()).toEqual({
		outcomes: { terms: [{ term: '202610', courses: [{ crn: '3', outcome: 'failed' }] }] },
		warnings: [expect.stringContaining('Skipped term 202620')]
	});
});

it('accepts a response returning all thirteen records despite a page size of ten', async () => {
	setup(
		Array.from({ length: 13 }, (_, index) => course(index + 1, 'B-')),
		13
	);
	const result = await lookupCourseOutcomes();
	expect('error' in result).toBe(false);
	expect(fetchMock).toHaveBeenCalledTimes(4);
});

it.each([
	{ success: false, data: [], totalCount: 0, pageOffset: '0' },
	{ success: true, data: [], totalCount: 13, pageOffset: '0' },
	{ success: true, data: [course(1, 'B-'), course(1, 'B-')], totalCount: 2, pageOffset: '0' },
	{ success: true, data: [course(1, 'B-')], totalCount: 1, pageOffset: '10' }
])('rejects unsafe partial or repeated responses', async (body) => {
	fetchMock.mockImplementation(async (path: string) =>
		json(path.includes('/courses?') ? body : {})
	);
	expect(await lookupCourseOutcomes()).toEqual({ error: expect.any(String) });
});

it.each([401, 403, 500])('does not continue after LeopardWeb returns %s', async (status) => {
	fetchMock.mockResolvedValue(json({}, status));
	expect(await lookupCourseOutcomes()).toEqual({ error: expect.any(String) });
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('rejects a redirected or HTML login response', async () => {
	fetchMock.mockResolvedValue(
		new Response('<form>Sign in</form>', { headers: { 'content-type': 'text/html' } })
	);
	expect(await lookupCourseOutcomes()).toEqual({ error: expect.stringContaining('log in') });
});
