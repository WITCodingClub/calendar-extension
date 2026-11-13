import { describe, expect, it } from 'vitest';
import {
	defaultPrefs,
	effectivePrefs,
	relaxAnswers,
	toScheduleRequest,
	type Answers
} from './builder';

function answers(patch: Partial<Answers> = {}): Answers {
	return { prefs: defaultPrefs(), offMode: 'none', offDays: [], ...patch };
}

describe('toScheduleRequest', () => {
	it('sends only the answers that differ from the defaults', () => {
		const request = toScheduleRequest('202720', [{ codes: ['COMP 3350'] }], {
			...defaultPrefs(),
			openOnly: false
		});
		expect(request).toEqual({
			term_uid: 202720,
			courses: [{ codes: ['COMP 3350'] }],
			preferences: {}
		});
	});

	it('maps every answer to the backend preferences', () => {
		const prefs = effectivePrefs(
			answers({
				prefs: {
					...defaultPrefs(),
					earliest: 600,
					latest: 960,
					days: 'fewer',
					breaks: 'lunch',
					cells: {
						'monday:morning': 'no',
						'wednesday:morning': 'no',
						'friday:evening': 'avoid'
					}
				},
				offMode: 'pick',
				offDays: ['friday', 'tuesday']
			})
		);
		expect(toScheduleRequest(202720, [{ codes: ['MATH 2300', 'MATH 2860'] }], prefs, 6)).toEqual({
			term_uid: 202720,
			courses: [{ codes: ['MATH 2300', 'MATH 2860'] }],
			preferences: {
				blocked: [{ days: ['monday', 'wednesday'], before: '10:00' }],
				avoid: [{ days: ['friday'], after: '17:00' }],
				earliest: '10:00',
				latest: '16:00',
				day_off: ['tuesday', 'friday'],
				open_only: true,
				days: 'fewer',
				breaks: 'lunch'
			},
			limit: 6
		});
		const any = effectivePrefs(answers({ offMode: 'any', offDays: ['monday'] }));
		expect(toScheduleRequest(1, [{ codes: ['A 1'] }], any).preferences?.day_off).toBe('any');
	});

	it('keeps pinned CRNs, drops empty or repeated entries, and keeps the code limits', () => {
		const request = toScheduleRequest(
			1,
			[
				{ codes: ['COMP 3350'] },
				{ codes: [] },
				{ codes: ['COMP 3350'] },
				{ codes: ['COMP 2280'], crns: ['20210'] }
			],
			defaultPrefs()
		);
		expect(request.courses).toEqual([
			{ codes: ['COMP 3350'] },
			{ codes: ['COMP 2280'], crns: ['20210'] }
		]);
		const codes = (prefix: string) => Array.from({ length: 8 }, (_, i) => `${prefix} ${1000 + i}`);
		const wide = toScheduleRequest(
			1,
			['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE'].map((prefix) => ({ codes: codes(prefix) })),
			defaultPrefs()
		);
		expect(wide.courses.map((course) => course.codes.length)).toEqual([4, 4, 4, 4, 4]);
	});
});

describe('relaxAnswers', () => {
	const strict = answers({
		prefs: {
			...defaultPrefs(),
			earliest: 600,
			latest: 960,
			openOnly: true,
			cells: { 'monday:morning': 'no', 'tuesday:midday': 'avoid' }
		},
		offMode: 'pick',
		offDays: ['friday']
	});

	it('maps each backend relax preference back to the matching answer', () => {
		expect(relaxAnswers('open_only', strict).prefs.openOnly).toBe(false);
		expect(relaxAnswers('earliest', strict).prefs.earliest).toBe(480);
		expect(relaxAnswers('latest', strict).prefs.latest).toBe(1320);
		expect(relaxAnswers('day_off', strict)).toMatchObject({ offMode: 'none', offDays: [] });
		expect(relaxAnswers('blocked', strict).prefs.cells).toEqual({ 'tuesday:midday': 'avoid' });
		expect(relaxAnswers('something_new', strict)).toBe(strict);
	});

	it('removes only the relaxed rule from the next request', () => {
		const relaxed = toScheduleRequest(
			1,
			[{ codes: ['A 1'] }],
			effectivePrefs(relaxAnswers('day_off', strict))
		).preferences;
		expect(relaxed?.day_off).toBeUndefined();
		expect(relaxed?.earliest).toBe('10:00');
	});
});
