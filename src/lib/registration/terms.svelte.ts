import { API } from '../api';
import type { PanelSession } from '../panel/session';
import { codeOf, isLab, rowLabel, suggestionsOf, unique, type Suggestion } from './options';
import { allSections, sectionsByCrn, sectionsOfCodes } from './sections';
import { Source, TermSources } from './source.svelte';
import type {
	CatalogSection,
	DegreeProgress,
	NextTermCourses,
	NextTermRow,
	SavedRegistrationPlan
} from './types';

export type TermOption = { uid: string; name: string; registering: boolean; published: boolean };

export function termAfter(uid: string) {
	const code = Number(uid);
	const year = Math.floor(code / 100);
	const suffix = code % 100;
	return String(suffix === 30 ? (year + 1) * 100 + 10 : year * 100 + suffix + 10);
}

export function termLabel(uid: string) {
	const code = Number(uid);
	const year = Math.floor(code / 100);
	const season = code % 100;
	if (season === 10) return `Fall ${year - 1}`;
	return `${season === 20 ? 'Spring' : 'Summer'} ${year}`;
}

export class TermData {
	readonly session: PanelSession;
	readonly active = () => this.session.active;
	readonly progress = new Source<DegreeProgress>(this.active);
	readonly registering = new Source<NextTermCourses>(this.active);
	readonly #idle = new TermSources(() => false);
	sources = $state<Record<string, TermSources>>({});
	upcoming = $state<string[]>([]);
	#term = $state('');
	#fetching: string[] = [];

	constructor(session: PanelSession) {
		this.session = session;
	}

	get term() {
		return this.#term;
	}

	set term(uid: string) {
		this.selectTerm(uid);
	}

	registeringUid = $derived(String(this.registering.data?.term.uid ?? ''));
	termOptions = $derived.by<TermOption[]>(() => {
		return this.upcoming.map((uid) => {
			const data = this.sources[uid]?.courses.data;
			return {
				uid,
				name: data?.term.name ?? termLabel(uid),
				registering: uid === this.registeringUid,
				published: data?.sections ?? false
			};
		});
	});
	current = $derived<TermSources>(this.sources[this.#term] ?? this.#idle);
	courses = $derived<Source<NextTermCourses>>(
		this.sources[this.#term]?.courses ?? this.registering
	);
	saved = $derived<Source<SavedRegistrationPlan | null>>(this.current.saved);
	catalog = $derived<Source<CatalogSection[]>>(this.current.catalog);
	data = $derived(this.courses.data);
	published = $derived(this.data?.sections ?? false);
	termName = $derived(
		this.data?.term.name ?? this.termOptions.find((term) => term.uid === this.#term)?.name ?? ''
	);
	program = $derived(this.data?.programs[0]);
	programs = $derived(this.progress.data?.programs ?? []);
	suggestionsByTerm = $derived<Record<string, Suggestion[]>>(
		Object.fromEntries(
			Object.entries(this.sources).map(([uid, sources]) => [
				uid,
				sources.courses.data
					? suggestionsOf(sources.courses.data, (program, row) => this.#plannedTerm(program, row))
					: []
			])
		)
	);
	suggestions = $derived(this.suggestionsByTerm[this.#term] ?? []);
	sections = $derived(this.current.sections());

	#plannedTerm(program: string, row: NextTermRow) {
		const found = this.progress.data?.programs
			.find((entry) => entry.program === program)
			?.requirements.find(
				(entry) =>
					entry.year === row.year &&
					entry.season === row.season &&
					entry.kind === row.kind &&
					(entry.label ?? entry.code ?? entry.kind) === rowLabel(row)
			);
		return found?.planned_term ?? null;
	}

	start() {
		void this.progress.load(() => API.getDegreeProgress());
		void this.registering.load(
			() => API.getNextTermCourses(),
			(data) => this.#registeringLoaded(data)
		);
	}

	#registeringLoaded(data: NextTermCourses) {
		if (data.term.uid === null) return;
		const uid = String(data.term.uid);
		if (!this.sources[uid]) this.sources[uid] = new TermSources(this.active, this.registering);
		void this.#findUpcoming(uid);
	}

	async #findUpcoming(registering: string) {
		let current: string | undefined;
		try {
			const terms = await this.session.loadTerms();
			if (terms.current_term) current = String(terms.current_term.id);
		} catch (error) {
			console.error('Failed to load the terms for registration', error);
		}
		if (!this.active()) return;
		const first = current ? termAfter(current) : registering;
		this.upcoming = [first, termAfter(first)];
		if (!this.#term || !this.upcoming.includes(this.#term)) this.selectTerm(first);
		for (const uid of this.upcoming) {
			if (uid !== this.#term) this.#loadTerm(uid);
		}
	}

	#ensure(uid: string) {
		if (!this.sources[uid]) this.sources[uid] = new TermSources(this.active);
		return this.sources[uid];
	}

	selectTerm(uid: string) {
		if (!uid || uid === this.#term) return;
		this.#term = uid;
		this.#loadTerm(uid);
	}

	#loadTerm(uid: string) {
		const sources = this.#ensure(uid);
		if (!sources.courses.started)
			void sources.courses.load(
				() => API.getNextTermCourses(uid),
				() => this.#coursesLoaded(uid)
			);
		else if (sources.courses.data) this.#coursesLoaded(uid);
		this.#loadSaved(uid);
	}

	#loadSaved(uid: string) {
		const sources = this.#ensure(uid);
		if (!sources.saved.started)
			void sources.saved.load(
				() => API.getRegistrationPlan(uid),
				() => this.savedLoaded(uid)
			);
	}

	protected savedLoaded(uid: string) {
		void uid;
	}

	protected catalogLoaded(uid: string) {
		void uid;
	}

	#coursesLoaded(uid: string) {
		const sources = this.sources[uid];
		if (uid !== this.#term || !sources?.courses.data?.sections || sources.catalog.started) return;
		const codes = unique(
			(this.suggestionsByTerm[uid] ?? []).flatMap((entry) =>
				entry.options.map((option) => option.code)
			)
		);
		void sources.catalog.load(
			() => sectionsOfCodes(uid, codes),
			() => this.catalogLoaded(uid)
		);
	}

	async fetchSections(uid: string, crns: string[]) {
		const sources = this.sources[uid];
		if (!sources) return;
		const missing = unique(crns).filter(
			(crn) =>
				!this.#fetching.includes(crn) && !sources.sections().some((section) => section.crn === crn)
		);
		if (!missing.length) return;
		this.#fetching.push(...missing);
		try {
			const found = await sectionsByCrn(uid, missing);
			if (this.active()) sources.addSections(found);
		} catch (error) {
			console.error('Failed to load sections', error);
		} finally {
			this.#fetching = this.#fetching.filter((crn) => !missing.includes(crn));
		}
	}

	async searchCourses(query: string): Promise<{ code: string; title: string }[]> {
		const uid = this.#term;
		const sources = this.sources[uid];
		if (!sources || query.trim().length < 2) return [];
		const found = await API.getSections({ term_uid: uid, q: query.trim(), per_page: 100 });
		if (!this.active()) return [];
		sources.addSections(found.data);
		const titles: Record<string, string> = {};
		for (const section of found.data) titles[codeOf(section)] ??= section.title;
		return Object.entries(titles).map(([code, title]) => ({ code, title }));
	}

	async loadCourse(code: string) {
		const uid = this.#term;
		const [subject, number] = code.split(' ');
		const sources = this.sources[uid];
		if (!sources || !subject || !number) return;
		const found = await allSections({ term_uid: uid, subject, course_number: [number] });
		if (this.active()) sources.addSections(found.filter((section) => codeOf(section) === code));
	}

	section(crn: string) {
		return this.sections.find((section) => section.crn === crn);
	}

	lectures(code: string) {
		const all = this.sections.filter(
			(section) => codeOf(section) === code && section.status === 'active'
		);
		const lectures = all.filter((section) => !isLab(section));
		return lectures.length ? lectures : all;
	}

	labsFor(crn: string) {
		const lecture = this.section(crn);
		if (!lecture?.linked.required) return [];
		return lecture.linked.crns
			.filter((partner) => partner !== crn)
			.map((partner) => this.section(partner))
			.filter((section): section is CatalogSection => Boolean(section));
	}
}
