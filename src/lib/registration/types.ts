export type * from './catalogTypes';
import type { ScheduleCheck } from './catalogTypes';

export type ProgressStatus = 'done' | 'in_progress' | 'open';
export type PrerequisiteStatus = 'met' | 'not_met' | 'unknown' | null;
export type RowKind = 'course' | 'choice' | 'placeholder';
export type EstimateMove = 'taken' | 'behind' | 'prerequisite' | 'offered' | 'co_op' | 'load';

export type CourseDetails = {
	description: string | null;
	credit_hours: number | null;
	typically_offered: string[] | null;
};

export type RowList = {
	heading: string | null;
	notes: string | null;
	min_courses: number | null;
	min_credits: number | null;
	subject_codes: string[];
} | null;

export type NextTermCourse = CourseDetails & {
	code: string;
	title: string | null;
	offered: boolean | null;
	prerequisites: PrerequisiteStatus;
	missing: string[];
	missing_in_plan: string[];
};

export type ElectiveCandidate = {
	code: string;
	title: string | null;
	credits: number | null;
	hss_category: string | null;
	prerequisites: PrerequisiteStatus;
	missing: string[];
	missing_in_plan: string[];
	open_seats: boolean | null;
};

export type NextTermRow = {
	year: number;
	season: string;
	kind: RowKind;
	code: string | null;
	label: string | null;
	elective_list: string | null;
	list: RowList;
	hss_category: string | null;
	courses: NextTermCourse[];
	candidates?: ElectiveCandidate[];
};

export type NextTermProgram = {
	program: string;
	name: string;
	plan: string;
	start_term: string | null;
	semester: { year: number; season: string } | null;
	planned: NextTermRow[];
	behind: NextTermRow[];
};

export type NextTermCourses = {
	term: { uid: number | null; name: string | null };
	assumed?: { courses: string[]; from_plans: number[] };
	sections: boolean;
	programs: NextTermProgram[];
	assumptions: string[];
};

export type FilledCourse = Partial<CourseDetails> & { code: string; title: string | null };

export type RequirementRow = Partial<CourseDetails> & {
	year?: number;
	season?: string;
	kind: RowKind | 'elective_list';
	code?: string | null;
	label?: string | null;
	options?: string[];
	elective_list: string | null;
	hss_category?: string | null;
	min_courses?: number | null;
	min_credits?: number | null;
	checkable: boolean;
	status: ProgressStatus;
	course?: string | null;
	term?: string | null;
	courses?: string[];
	planned_term: string | null;
	planned_term_uid: number | null;
	behind: boolean;
	expected_term?: string | null;
	expected_term_uid?: number | null;
	moved?: EstimateMove | null;
	title?: string | null;
	list?: RowList;
	filled_course?: FilledCourse | null;
};

export type PlanTerm = {
	term: string;
	uid: number;
	year: number | null;
	season: string;
	when: 'past' | 'current' | 'registering' | 'future' | null;
	estimated: boolean;
	co_op: boolean;
	basis?: 'taken' | 'plan' | 'estimate';
};

export type ProgramList = {
	name: string;
	min_courses: number | null;
	min_credits: number | null;
	notes: string | null;
	checkable: boolean;
	courses: {
		code: string;
		title: string | null;
		status: ProgressStatus;
		term: string | null;
		major_term: string | null;
	}[];
};

export type HssCategory = {
	name: string;
	checkable: boolean;
	status: ProgressStatus;
	course: string | null;
	hint: { subject_codes: string[]; courses: string[] } | null;
};

export type HssProgress = {
	min_credits: number | null;
	credits: number;
	categories: HssCategory[];
	english: { credits: number; courses: string[] };
	courses: {
		code: string;
		title: string;
		credits: number | null;
		status: 'done' | 'in_progress';
		category: string | null;
	}[];
	open_slots: {
		label: string | null;
		planned_term: string | null;
		planned_term_uid: number | null;
		hss_category: string | null;
	}[];
};

export type ProgramSummary = {
	total_credits: number | null;
	school: string | null;
	department: string | null;
	credits: {
		earned: number;
		in_progress: number;
		not_counted: { earned: number; in_progress: number; courses: string[] };
	};
	co_ops: { required: number; done: number };
};

export type OverlapSlot = {
	label: string | null;
	planned_term: string | null;
	planned_term_uid: number | null;
	courses: string[];
};

export type ProgramOverlap = {
	shared: number;
	extra: number;
	slots: OverlapSlot[];
	unplaced: number;
	expected_end_with_minor: { term: string; estimated: boolean } | null;
};

export type DegreeProgram = {
	program: string;
	status: 'active' | 'planned' | null;
	name: string;
	catalog_year: string;
	needs_review: boolean;
	plan: string | null;
	plans: string[];
	counts: { done: number; in_progress: number; open: number };
	summary: ProgramSummary;
	requirements: RequirementRow[];
	hss: HssProgress | null;
	start_term: string | null;
	expected_end: { term: string; estimated: boolean; plan_end?: string | null } | null;
	timeline: PlanTerm[];
	total_credits: number | null;
	school: string | null;
	lists: ProgramList[];
	overlap?: ProgramOverlap | null;
};

export type TakenCourse = {
	code: string;
	title: string;
	term: string;
	term_uid: number;
	crn: number;
	credits: number | null;
	status: 'done' | 'in_progress' | 'not_passed';
	outcome: string | null;
};

export type DegreeProgress = {
	programs: DegreeProgram[];
	courses: TakenCourse[];
	assumptions: string[];
};

export type PlanFill = { kind: string; label: string };

export type PlanCourse = { code: string; crns: string[]; fills: PlanFill | null };

export type RegistrationPlanBody = {
	courses: PlanCourse[];
	preferences: Record<string, unknown>;
};

export type SavedRegistrationPlan = {
	term: { uid: number; name: string | null };
	courses: PlanCourse[];
	preferences: Record<string, unknown>;
	crns: string[];
	updated_at: string | null;
	schedule_check: ScheduleCheck;
};
