import { getContext, setContext } from 'svelte';
import { API } from '../api';
import { FinderState } from './finder.svelte';
import { codeOf, conflictText, sectionsConflict, type Candidate } from './options';
import { errorText } from './source.svelte';
import type { CatalogSection } from './types';

export type Issue = { code: string; text: string };

export class RegistrationPlan extends FinderState {
	stage = $state<'plan' | 'review'>('plan');
	saving = $state(false);
	saveError = $state('');

	issues = $derived.by(() => {
		const list: Issue[] = [];
		for (const code of this.added) {
			const pick = this.picks[code];
			if (!pick?.lecture) list.push({ code, text: `Choose a section for ${code}` });
			else if (this.labsFor(pick.lecture).length && !pick.lab)
				list.push({ code, text: `Choose a lab for ${code}` });
		}
		const check = this.check;
		if (!check) return list;
		const codeFor = (crn: string) =>
			this.added.find(
				(code) => this.picks[code]?.lecture === crn || this.picks[code]?.lab === crn
			) ?? crn;
		for (const conflict of check.conflicts) {
			if (!conflict.crns.every((crn) => this.crns.includes(crn))) continue;
			const [a, b] = conflict.crns.map(codeFor);
			list.push({ code: a, text: conflictText([a, b], conflict.day) });
		}
		for (const crn of check.cancelled.filter((entry) => this.crns.includes(entry)))
			list.push({ code: codeFor(crn), text: `${codeFor(crn)} section ${crn} was cancelled` });
		for (const crn of check.not_found.filter((entry) => this.crns.includes(entry)))
			list.push({
				code: codeFor(crn),
				text: `${codeFor(crn)} section ${crn} isn't offered in ${this.termName}`
			});
		return list;
	});
	ready = $derived(this.added.length > 0 && this.issues.length === 0);

	override selectTerm(uid: string) {
		if (!uid || uid === this.term) return;
		super.selectTerm(uid);
		this.stage = 'plan';
		this.saveError = '';
	}

	override edited(uid = this.term) {
		super.edited(uid);
		if (uid === this.term) this.stage = 'plan';
	}

	use(candidate: Candidate) {
		this.added = candidate.codes;
		this.picks = candidate.picks;
		this.fills = candidate.fills;
		this.previewIndex = null;
		this.edited();
	}

	add(code: string, fill?: string) {
		if (!this.added.includes(code)) this.added = [...this.added, code];
		if (fill) this.fills = { ...this.fills, [code]: fill };
		this.edited();
	}

	remove(code: string) {
		this.added = this.added.filter((entry) => entry !== code);
		this.picks = Object.fromEntries(Object.entries(this.picks).filter(([key]) => key !== code));
		this.fills = Object.fromEntries(Object.entries(this.fills).filter(([key]) => key !== code));
		this.edited();
	}

	pickLecture(code: string, crn: string) {
		if (!this.added.includes(code)) this.added = [...this.added, code];
		const labs = this.labsFor(crn);
		this.picks = {
			...this.picks,
			[code]: labs.length === 1 ? { lecture: crn, lab: labs[0].crn } : { lecture: crn }
		};
		this.edited();
	}

	pickLab(code: string, crn: string) {
		this.picks = { ...this.picks, [code]: { ...this.picks[code], lab: crn } };
		this.edited();
	}

	overlaps(candidate: CatalogSection, ignore?: string) {
		const names: string[] = [];
		for (const other of this.chosen) {
			const code = codeOf(other);
			if (code === ignore || other.crn === candidate.crn || names.includes(code)) continue;
			if (sectionsConflict(candidate, other)) names.push(code);
		}
		return names;
	}

	async save(): Promise<boolean> {
		const term = this.term;
		const sources = this.sources[term];
		const courses = this.planCourses(term);
		const missing = courses.find((course) => !course.crns.length);
		if (!sources || !courses.length || missing) {
			this.saveError = missing
				? `Choose a section for ${missing.code} first.`
				: 'Add a course first.';
			return false;
		}
		const sent = JSON.stringify(courses);
		this.saving = true;
		this.saveError = '';
		try {
			const saved = await API.saveRegistrationPlan(term, {
				courses,
				preferences: { prefs: this.prefs, offMode: this.offMode, offDays: this.offDays }
			});
			if (!this.active()) return false;
			sources.saved.set(saved, () => API.getRegistrationPlan(term));
			this.markSaved(term, saved.updated_at, JSON.stringify(this.planCourses(term)) === sent);
			for (const option of this.termOptions)
				if (Number(option.uid) > Number(term)) void this.sources[option.uid]?.courses.retry();
			return true;
		} catch (error) {
			if (this.active()) this.saveError = errorText(error);
			return false;
		} finally {
			if (this.active()) this.saving = false;
		}
	}
}

const KEY = Symbol('registrationPlan');

export function setRegistrationPlan(current: () => RegistrationPlan): void {
	setContext(KEY, current);
}

export function getRegistrationPlan(): RegistrationPlan {
	return getContext<() => RegistrationPlan>(KEY)();
}
