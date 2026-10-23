import { API } from '../api';
import { fetchAcademicProfile, type AcademicProfile } from './academicProfile';
import { fetchCourseOutcomes, type CourseOutcomes } from './courseOutcomes';
import type { Backfills } from '../panel/backfills';

export type AcademicData = {
	profile: AcademicProfile;
	outcomes: CourseOutcomes;
	warnings: string[];
};

export async function syncAcademicData(active: () => boolean) {
	const profile = await fetchAcademicProfile(active);
	if (!profile || !active()) return;
	if (
		profile.level?.trim().toLowerCase() !== 'undergraduate' ||
		profile.programs.some(
			(program) => program.degree && /^(master|doctor)\b/i.test(program.degree.trim())
		)
	)
		throw new Error(
			'Course outcomes currently support undergraduate records only. Your academic data sync was not completed; saved data was preserved.'
		);
	const outcomes = await fetchCourseOutcomes(active);
	if (!outcomes || !active()) return;
	const data: AcademicData = { profile, outcomes: outcomes.outcomes, warnings: outcomes.warnings };
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
			'Some course outcomes were not saved because their courses have not been processed. Fetch your courses, then select Retry.'
		);
	const complete =
		data.warnings.length === 0 && savedOutcomes.terms.every((term) => !term.unknown_crns.length);
	return { ...data, saved: { profile: savedProfile, outcomes: savedOutcomes }, warnings, complete };
}

export function backfillAcademicData(backfills: Backfills, active: () => boolean, force = false) {
	return backfills.run('academic_data', () => syncAcademicData(active), force);
}
