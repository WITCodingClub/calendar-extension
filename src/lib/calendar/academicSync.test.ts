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

it('sends both datasets and reports successful completion', async () => {
	const active = () => true;
	const result = await syncAcademicData(active);
	expect(API.saveAcademicProfile).toHaveBeenCalledWith(profile);
	expect(API.saveCourseOutcomes).toHaveBeenCalledWith(outcomes, active);
	expect(result?.warnings).toEqual([]);
	expect(result?.complete).toBe(true);
});

it.each(['Graduate', 'Undergraduate / Graduate', null, ''])(
	'rejects unsupported or unknown profile level %s before collecting or saving',
	async (level) => {
		vi.mocked(fetchAcademicProfile).mockResolvedValue({ ...profile, level });
		await expect(syncAcademicData(() => true)).rejects.toThrow('undergraduate records only');
		expect(fetchCourseOutcomes).not.toHaveBeenCalled();
		expect(API.saveAcademicProfile).not.toHaveBeenCalled();
		expect(API.saveCourseOutcomes).not.toHaveBeenCalled();
	}
);

it('rejects mixed undergraduate and graduate programs before saving a partial result', async () => {
	vi.mocked(fetchAcademicProfile).mockResolvedValue({
		...profile,
		programs: ['Bachelor of Science', 'Master of Science'].map((degree) => ({
			role: 'major',
			code: null,
			name: 'Computer Science',
			degree,
			college: null,
			department: null,
			concentration: null,
			study_path: null,
			catalog_term: null
		}))
	});
	await expect(syncAcademicData(() => true)).rejects.toThrow('undergraduate records only');
	expect(fetchCourseOutcomes).not.toHaveBeenCalled();
	expect(API.saveAcademicProfile).not.toHaveBeenCalled();
	expect(API.saveCourseOutcomes).not.toHaveBeenCalled();
});

it('stops sending when the profile save fails', async () => {
	vi.mocked(API.saveAcademicProfile).mockRejectedValueOnce(new Error('Backend unavailable'));
	await expect(syncAcademicData(() => true)).rejects.toThrow('Backend unavailable');
	expect(API.saveCourseOutcomes).not.toHaveBeenCalled();
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

it('reports unknown enrollments and unmatched programs without marking completion', async () => {
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
	const result = await syncAcademicData(() => true);
	expect(result?.complete).toBe(false);
	expect(result?.warnings).toEqual([
		expect.stringContaining('could not be matched'),
		expect.stringContaining('Fetch your courses, then select Retry.')
	]);
});
