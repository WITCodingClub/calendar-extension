import { readDrafts, writeDrafts, type Drafts } from './draft';
import {
	codeOf,
	fillOf,
	isLab,
	type CourseOption,
	type DroppedCrn,
	type SectionPick,
	type Suggestion
} from './options';
import { emptyPicks, picksFrom, withoutUnavailable, type TermPicks } from './restore';
import { TermData } from './terms.svelte';
import type { CatalogSection, PlanCourse, RequirementRow, SavedRegistrationPlan } from './types';

export type ScheduledRow = { term: string; uid: string; code: string };
export type RowRef = Pick<RequirementRow, 'code' | 'label' | 'kind' | 'year' | 'season' | 'status'>;

const EMPTY = emptyPicks();

export class PlanData extends TermData {
	byTerm = $state<Record<string, TermPicks>>({});
	dropped = $state<DroppedCrn[]>([]);
	#drafts: Promise<Drafts> = Promise.resolve({});
	#draftCache: Drafts = {};
	#restored: string[] = [];

	savedAt = $derived(this.byTerm[this.term]?.savedAt ?? null);

	get added() {
		return (this.byTerm[this.term] ?? EMPTY).added;
	}
	set added(value: string[]) {
		this.#update(this.term, { added: value });
	}
	get fills() {
		return (this.byTerm[this.term] ?? EMPTY).fills;
	}
	set fills(value: Record<string, string>) {
		this.#update(this.term, { fills: value });
	}
	get picks() {
		return (this.byTerm[this.term] ?? EMPTY).picks;
	}
	set picks(value: Record<string, SectionPick>) {
		this.#update(this.term, { picks: value });
	}

	crns = $derived(
		this.added.flatMap((code) =>
			[this.picks[code]?.lecture, this.picks[code]?.lab].filter((crn): crn is string =>
				Boolean(crn)
			)
		)
	);
	chosen: CatalogSection[] = $derived(
		this.crns
			.map((crn) => this.section(crn))
			.filter((section): section is CatalogSection => Boolean(section))
	);
	credits = $derived(
		this.added.reduce((sum, code) => {
			const lecture = this.picks[code]?.lecture;
			if (!lecture) return sum;
			return sum + (this.section(lecture)?.credit_hours ?? this.option(code).credits ?? 0);
		}, 0)
	);

	#update(uid: string, patch: Partial<TermPicks>) {
		if (!uid) return;
		this.byTerm[uid] = { ...(this.byTerm[uid] ?? emptyPicks()), ...patch };
	}

	override start() {
		this.#drafts = readDrafts().then((drafts) => (this.#draftCache = drafts));
		super.start();
	}

	protected override savedLoaded(uid: string) {
		void this.#restore(uid);
	}

	protected override catalogLoaded(uid: string) {
		void this.fetchSections(uid, this.#pickedCrns(uid));
	}

	#pickedCrns(uid: string) {
		return Object.values(this.byTerm[uid]?.picks ?? {})
			.flatMap((pick) => [pick.lecture, pick.lab])
			.filter((crn): crn is string => Boolean(crn));
	}

	async #restore(uid: string) {
		const sources = this.sources[uid];
		if (!sources?.saved.loaded || this.#restored.includes(uid)) return;
		await this.#drafts;
		if (!this.active() || this.#restored.includes(uid)) return;
		this.#restored.push(uid);
		const saved = sources.saved.data ?? null;
		const base = saved?.updated_at ?? null;
		const draft = this.#draftCache[uid];
		if (this.byTerm[uid]?.dirty) this.#update(uid, { base });
		else if (draft && draft.base === base) {
			this.#update(uid, { ...picksFrom(draft.courses), savedAt: null, base, dirty: true });
		} else if (saved) {
			const name =
				saved.term.name ?? this.termOptions.find((term) => term.uid === uid)?.name ?? uid;
			const { courses, dropped } = withoutUnavailable(saved, name);
			this.#update(uid, {
				...picksFrom(courses),
				savedAt: dropped.length ? null : base,
				base,
				dirty: dropped.length > 0
			});
			if (dropped.length) {
				this.dropped = [...this.dropped, ...dropped];
				this.#saveDrafts();
			}
		}
		this.onRestored(uid, saved);
		if (sources.catalog.loaded) void this.fetchSections(uid, this.#pickedCrns(uid));
	}

	protected onRestored(uid: string, saved: SavedRegistrationPlan | null) {
		void uid;
		void saved;
	}

	clearDropped() {
		this.dropped = [];
	}

	planCourses(uid = this.term): PlanCourse[] {
		const picks = this.byTerm[uid] ?? EMPTY;
		return picks.added.map((code) => {
			const pick = picks.picks[code];
			const suggestion = this.suggestionFor(code, uid);
			const fill = picks.fills[code];
			return {
				code,
				crns: [pick?.lecture, pick?.lab].filter((crn): crn is string => Boolean(crn)),
				fills: suggestion
					? { kind: suggestion.kind, label: suggestion.label }
					: fill
						? fillOf(fill)
						: null
			};
		});
	}

	#saveDrafts() {
		const entries = Object.entries(this.byTerm).map(([uid, picks]) => ({
			uid,
			draft: picks.dirty ? { base: picks.base, courses: this.planCourses(uid) } : null
		}));
		void this.#drafts.then(() => {
			if (!this.active()) return;
			const drafts: Drafts = { ...this.#draftCache };
			for (const { uid, draft } of entries) {
				if (draft) drafts[uid] = draft;
				else delete drafts[uid];
			}
			this.#draftCache = drafts;
			return writeDrafts(drafts);
		});
	}

	edited(uid = this.term) {
		this.#update(uid, { savedAt: null, dirty: true });
		this.#saveDrafts();
	}

	markSaved(uid: string, updatedAt: string | null, clean: boolean) {
		this.#update(
			uid,
			clean ? { savedAt: updatedAt, base: updatedAt, dirty: false } : { base: updatedAt }
		);
		this.#saveDrafts();
	}

	scheduledIn(row: RowRef): ScheduledRow | null {
		if (row.status !== 'open') return null;
		for (const term of this.termOptions) {
			const picks = this.byTerm[term.uid];
			if (!picks?.added.length) continue;
			if (row.code) {
				if (picks.added.includes(row.code))
					return { term: term.name, uid: term.uid, code: row.code };
				continue;
			}
			const code = picks.added.find((entry) => {
				const suggestion = this.suggestionFor(entry, term.uid);
				return (
					suggestion &&
					suggestion.kind !== 'course' &&
					suggestion.row.year === row.year &&
					suggestion.row.season === row.season &&
					suggestion.kind === row.kind &&
					suggestion.label === (row.label ?? row.code ?? row.kind)
				);
			});
			if (code) return { term: term.name, uid: term.uid, code };
		}
		return null;
	}

	scheduled(row: RowRef) {
		return this.scheduledIn(row)?.code ?? null;
	}

	suggestionFor(code: string, uid = this.term): Suggestion | undefined {
		const list = this.suggestionsByTerm[uid] ?? [];
		const fill = this.byTerm[uid]?.fills[code];
		return (
			list.find((entry) => entry.id === fill) ??
			list.find((entry) => entry.options.some((option) => option.code === code))
		);
	}

	option(code: string, uid = this.term): CourseOption {
		const found =
			this.suggestionFor(code, uid)?.options.find((option) => option.code === code) ??
			(this.suggestionsByTerm[uid] ?? [])
				.flatMap((entry) => entry.options)
				.find((option) => option.code === code);
		if (found) return found;
		const lecture = (this.sources[uid]?.sections() ?? []).find(
			(section) => codeOf(section) === code && !isLab(section)
		);
		return {
			code,
			title: lecture?.title ?? code,
			credits: lecture?.credit_hours ?? null,
			offered: lecture ? true : null,
			prerequisites: null,
			missing: [],
			missingInPlan: [],
			description: null,
			typicallyOffered: null,
			hssCategory: null,
			openSeats: null
		};
	}
}
