import { beforeEach, expect, it, vi } from 'vitest';
import { importSchedule, REGISTRATION_HISTORY_URL } from './leopardWeb';
import { backfillAcademicData } from './academicSync';
import { API } from '../api';
import { get } from 'svelte/store';
import { getCourseSync } from '../panel/courseSync';
import type { PanelSession } from '../panel/session';

vi.mock('../api', () => ({
	API: { processCourses: vi.fn(), userSettings: vi.fn(async () => ({})) }
}));
vi.mock('./academicSync', () => ({
	backfillAcademicData: vi.fn(async () => ({ complete: true, warnings: [] }))
}));
vi.mock('m3-svelte', () => ({ snackbar: vi.fn() }));
vi.mock('../stores', () => ({ enrolledTerms: { set: vi.fn() } }));

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(API.processCourses).mockResolvedValue({
		user_pub: 'test',
		ics_url: 'https://calendar.example.invalid/feed.ics'
	});
	vi.stubGlobal('chrome', {
		tabs: { query: vi.fn(async () => [{ id: 7, url: REGISTRATION_HISTORY_URL }]) },
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
	let finish!: () => void;
	const start = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	);
	const session = { active: true, termProcessing: { start } } as unknown as PanelSession;
	await expect(importSchedule(session, '202710')).resolves.toMatchObject({ termId: '202710' });
	expect(start).toHaveBeenCalledWith(['202620'], expect.any(Function));
	expect(backfillAcademicData).not.toHaveBeenCalled();
	finish();
	await vi.waitFor(() => expect(backfillAcademicData).toHaveBeenCalledTimes(1));
});

it('does not collect after a failed course import', async () => {
	vi.mocked(API.processCourses).mockRejectedValueOnce(new Error('Course import failed'));
	const session = { active: true, termProcessing: { start: vi.fn() } } as unknown as PanelSession;
	await expect(importSchedule(session, '202710')).rejects.toThrow('Course import failed');
	expect(backfillAcademicData).not.toHaveBeenCalled();
});

it('reports academic failures without losing the imported course response', async () => {
	vi.mocked(backfillAcademicData).mockRejectedValueOnce(new Error('Profile save failed'));
	const session = {
		active: true,
		termProcessing: { start: vi.fn(async () => {}) }
	} as unknown as PanelSession;
	await expect(importSchedule(session, '202710')).resolves.toMatchObject({ termId: '202710' });
	await vi.waitFor(() =>
		expect(get(getCourseSync(session)).message).toContain('Profile save failed')
	);
});
