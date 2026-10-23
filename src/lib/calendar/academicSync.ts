import { API } from '../api';
import { fetchAcademicProfile, type AcademicProfile } from './academicProfile';
import { fetchCourseOutcomes, type CourseOutcomes } from './courseOutcomes';
import type { Backfills } from '../panel/backfills';

export type AcademicData = {
	profile: AcademicProfile;
	outcomes: CourseOutcomes;
	warnings: string[];
};

export async function syncAcademicData(
	active: () => boolean,
	collected?: (data: AcademicData) => void
) {
	const profile = await fetchAcademicProfile(active);
	if (!profile || !active()) return;
	const outcomes = await fetchCourseOutcomes(active);
	if (!outcomes || !active()) return;
	const data: AcademicData = { profile, outcomes: outcomes.outcomes, warnings: outcomes.warnings };
	collected?.(data);
	if (!active()) return;
	const savedProfile = await API.saveAcademicProfile(profile);
	if (!active()) return;
	const savedOutcomes = await API.saveCourseOutcomes(data.outcomes, active);
	if (!active()) return;
	const warnings = [...data.warnings];
	if (savedProfile.programs.some((program) => program.matched === false))
		warnings.push('Some academic programs could not be matched to the catalog.');
	if (savedOutcomes.terms.some((term) => term.unknown_crns.length))
		warnings.push(
			'Some course outcomes were not saved because their courses have not been processed. Fetch your courses, then retry the academic profile test.'
		);
	const complete =
		data.warnings.length === 0 && savedOutcomes.terms.every((term) => !term.unknown_crns.length);
	return { ...data, saved: { profile: savedProfile, outcomes: savedOutcomes }, warnings, complete };
}

export function backfillAcademicData(
	backfills: Backfills,
	active: () => boolean,
	force = false,
	collected?: (data: AcademicData) => void
) {
	return backfills.run('academic_data', () => syncAcademicData(active, collected), force);
}
