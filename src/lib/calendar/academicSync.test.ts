import { beforeEach, expect, it, vi } from 'vitest';
import { syncAcademicData } from './academicSync';
import { fetchAcademicProfile, type AcademicProfile } from './academicProfile';
import { fetchCourseOutcomes } from './courseOutcomes';
import { API } from '../api';

vi.mock('./academicProfile', () => ({ fetchAcademicProfile: vi.fn() }));
vi.mock('./courseOutcomes', () => ({ fetchCourseOutcomes: vi.fn() }));
vi.mock('../api', () => ({ API: { saveAcademicProfile: vi.fn(), saveCourseOutcomes: vi.fn() } }));

const profile: AcademicProfile = {
	source: 'leopardweb',
	level: 'Undergraduate',
	class_standing: null,
	admit_type: null,
	admit_term: 'Fall 2025',
	programs: []
};
const outcomes = {
	terms: [{ term: '202610', courses: [{ crn: '1', outcome: 'c_or_better' as const }] }]
};

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(fetchAcademicProfile).mockResolvedValue(profile);
	vi.mocked(fetchCourseOutcomes).mockResolvedValue({ outcomes, warnings: [] });
	vi.mocked(API.saveAcademicProfile).mockResolvedValue({ ...profile, programs: [] });
	vi.mocked(API.saveCourseOutcomes).mockResolvedValue({
		terms: [{ term: '202610', updated: 1, unknown_crns: [] }]
	});
});

it('previews the sanitized payload before sending both datasets', async () => {
	const preview = vi.fn();
	const active = () => true;
	const result = await syncAcademicData(active, preview);
	expect(preview).toHaveBeenCalledWith({ profile, outcomes, warnings: [] });
	expect(API.saveAcademicProfile).toHaveBeenCalledWith(profile);
	expect(API.saveCourseOutcomes).toHaveBeenCalledWith(outcomes, active);
	expect(preview.mock.invocationCallOrder[0]).toBeLessThan(
		vi.mocked(API.saveAcademicProfile).mock.invocationCallOrder[0]
	);
	expect(result?.warnings).toEqual([]);
});

it('keeps collected data available when sending fails and permits a subsequent retry', async () => {
	const preview = vi.fn();
	vi.mocked(API.saveAcademicProfile).mockRejectedValueOnce(new Error('Backend unavailable'));
	await expect(syncAcademicData(() => true, preview)).rejects.toThrow('Backend unavailable');
	expect(preview).toHaveBeenCalled();
	expect(API.saveCourseOutcomes).not.toHaveBeenCalled();
	await expect(syncAcademicData(() => true)).resolves.toBeDefined();
});

it('does not send after the user changes sessions during collection', async () => {
	let active = true;
	vi.mocked(fetchCourseOutcomes).mockImplementation(async () => {
		active = false;
		return { outcomes, warnings: [] };
	});
	expect(await syncAcademicData(() => active)).toBeUndefined();
	expect(API.saveAcademicProfile).not.toHaveBeenCalled();
});

it('does not send outcomes into a changed session after saving the profile', async () => {
	let active = true;
	vi.mocked(API.saveAcademicProfile).mockImplementation(async () => {
		active = false;
		return { ...profile, programs: [] };
	});
	await syncAcademicData(() => active);
	expect(API.saveCourseOutcomes).not.toHaveBeenCalled();
});

it('reports unknown enrollments and unmatched programs without treating null matches as failures', async () => {
	vi.mocked(API.saveAcademicProfile).mockResolvedValue({
		...profile,
		programs: [
			{
				role: 'major',
				code: null,
				name: 'Unknown program',
				matched: false,
				degree: null,
				college: null,
				department: null,
				concentration: null,
				study_path: null,
				catalog_term: null
			}
		]
	});
	vi.mocked(API.saveCourseOutcomes).mockResolvedValue({
		terms: [{ term: '202610', updated: 0, unknown_crns: ['1'] }]
	});
	expect((await syncAcademicData(() => true))?.warnings).toEqual([
		expect.stringContaining('could not be matched'),
		expect.stringContaining('have not been processed')
	]);
});
