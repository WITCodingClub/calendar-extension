import { beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getCourseSync } from '../panel/courseSync';
import { importSchedule, REGISTRATION_HISTORY_URL } from './leopardWeb';
import { backfillAcademicData } from './academicSync';
import { API } from '../api';
import { snackbar } from 'm3-svelte';
import { PanelSession } from '../panel/session';
import { processedData } from '../stores';
import { Backfills } from '../panel/backfills';
import { backfillPastTerms } from './leopardWeb';

function sessionWith(start = vi.fn(async () => true)) {
	const api = {
		getBackfills: vi.fn(async () => ({
			past_terms: { completed: false, completed_at: null },
			academic_data: { completed: false, completed_at: null }
		})),
		completeBackfill: vi.fn(async () => ({
			past_terms: { completed: true, completed_at: '2026-10-23T12:00:00Z' },
			academic_data: { completed: false, completed_at: null }
		}))
	};
	const session = {
		active: true,
		termProcessing: { start },
		backfills: new Backfills(api, () => session.active)
	} as unknown as PanelSession;
	return { session, api };
}

vi.mock('../api', () => ({
	API: {
		processCourses: vi.fn(),
		userSettings: vi.fn(async () => ({})),
		userIsProcessed: vi.fn(),
		processCoursesBatch: vi.fn(),
		getProcessedEvents: vi.fn()
	}
}));
vi.mock('./academicSync', () => ({
	backfillAcademicData: vi.fn(async () => ({ complete: true, warnings: [] }))
}));
vi.mock('m3-svelte', () => ({ snackbar: vi.fn() }));
vi.mock('../stores', () => ({
	enrolledTerms: { set: vi.fn() },
	processedData: { update: vi.fn() }
}));

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(API.processCourses).mockResolvedValue({
		user_pub: 'test',
		ics_url: 'https://calendar.example.invalid/feed.ics'
	});
	vi.stubGlobal('chrome', {
		tabs: {
			query: vi.fn(async () => [{ id: 7, url: REGISTRATION_HISTORY_URL }]),
			get: vi.fn(async () => ({ id: 7, url: REGISTRATION_HISTORY_URL, status: 'complete' })),
			onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
			onRemoved: { addListener: vi.fn(), removeListener: vi.fn() }
		},
		scripting: {
			executeScript: vi.fn(async () => [
				{
					result: {
						usedTermId: '202710',
						termOptions: [
							{ id: '202710', name: 'Fall 2026' },
							{ id: '202620', name: 'Spring 2026' }
						],
						registrations: [{ courseReferenceNumber: '1', term: '202710', courseNumber: '1000' }]
					}
				}
			])
		}
	});
});

it('waits for historical course processing before collecting and sending academic data', async () => {
	let finish!: (complete: boolean) => void;
	const start = vi.fn(
		() =>
			new Promise<boolean>((resolve) => {
				finish = resolve;
			})
	);
	const { session, api } = sessionWith(start);
	await expect(importSchedule(session, '202710')).resolves.toMatchObject({ termId: '202710' });
	await vi.waitFor(() => expect(start).toHaveBeenCalled());
	expect(start).toHaveBeenCalledWith(['202620'], expect.any(Function));
	expect(backfillAcademicData).not.toHaveBeenCalled();
	expect(api.completeBackfill).not.toHaveBeenCalled();
	finish(true);
	await vi.waitFor(() => expect(backfillAcademicData).toHaveBeenCalledTimes(1));
	expect(api.completeBackfill).toHaveBeenCalledWith('past_terms');
	expect(snackbar).toHaveBeenCalledWith(
		'Your course history is up to date and your academic profile information has been sent.'
	);
});

it('does not collect after a failed course import', async () => {
	vi.mocked(API.processCourses).mockRejectedValueOnce(new Error('Course import failed'));
	const { session } = sessionWith();
	await expect(importSchedule(session, '202710')).rejects.toThrow('Course import failed');
	expect(backfillAcademicData).not.toHaveBeenCalled();
});

it('reports academic failures without losing the imported course response', async () => {
	vi.mocked(backfillAcademicData).mockRejectedValueOnce(new Error('Profile save failed'));
	const { session } = sessionWith();
	await expect(importSchedule(session, '202710')).resolves.toMatchObject({ termId: '202710' });
	await vi.waitFor(() =>
		expect(get(getCourseSync(session)).message).toContain('Profile save failed')
	);
});

it('discovers all terms without fetching a current calendar and leaves failed runs incomplete', async () => {
	const start = vi.fn(async () => false);
	const { session, api } = sessionWith(start);
	await expect(backfillPastTerms(session)).resolves.toEqual({ complete: false });
	expect(start).toHaveBeenCalledWith(['202710', '202620'], expect.any(Function));
	expect(API.processCourses).not.toHaveBeenCalled();
	expect(api.completeBackfill).not.toHaveBeenCalled();
});

it('completes background processing without replacing cached calendar data', async () => {
	vi.mocked(API.userIsProcessed).mockResolvedValue({ processed: false, status: 'not_started' });
	vi.mocked(API.processCoursesBatch).mockResolvedValue({
		user_pub: 'test',
		ics_url: 'test',
		terms: [{ term: '202610', status: 'processed' }]
	});
	vi.mocked(API.getProcessedEvents).mockResolvedValue({ classes: [] });
	const session = new PanelSession();
	expect(
		await session.termProcessing.start(['202610'], async () => [
			{ crn: '12345', term: '202610', courseNumber: '1000' }
		])
	).toBe(true);
	expect(processedData.update).not.toHaveBeenCalled();
	expect(API.getProcessedEvents).not.toHaveBeenCalled();
});

it('queues retry after an overlapping failed automatic run', async () => {
	let fail!: () => void;
	const start = vi
		.fn()
		.mockImplementationOnce(
			() =>
				new Promise<boolean>((resolve) => {
					fail = () => resolve(false);
				})
		)
		.mockResolvedValue(true);
	const { session } = sessionWith(start);
	const sync = getCourseSync(session);
	const first = sync.run();
	await vi.waitFor(() => expect(fail).toBeDefined());
	const retry = sync.run(undefined, true);
	fail();
	await Promise.all([first, retry]);
	expect(start).toHaveBeenCalledTimes(2);
	expect(get(sync).message).toBe('');
});

it.each(['discovery', 'courses'])(
	'keeps sign-in recovery when %s requests lose authentication',
	async (step) => {
		const { session } = sessionWith();
		vi.mocked(session.termProcessing.start).mockImplementation(async (terms, load) => {
			try {
				await load(terms[0]);
				return true;
			} catch {
				return false;
			}
		});
		const execute = vi.mocked(chrome.scripting.executeScript);
		if (step === 'courses')
			execute.mockImplementationOnce(async () => [
				{ result: { termOptions: [{ id: '202710', name: 'Fall 2026' }] } }
			]);
		execute.mockImplementationOnce(async () => [
			{ result: { error: 'Sign in required', loginRequired: true } }
		]);
		const sync = getCourseSync(session);
		await sync.run();
		expect(get(sync)).toMatchObject({ loginUrl: REGISTRATION_HISTORY_URL, running: false });
		expect(backfillAcademicData).not.toHaveBeenCalled();
	}
);
