import { untrack } from 'svelte';
import { API, ApiError } from '../api';
import type { PanelSession } from '../panel/session';
import {
	answersFrom,
	countLabel,
	defaultPrefs,
	effectivePrefs,
	relaxAnswers,
	toScheduleRequest,
	type Answers,
	type OffMode,
	type Prefs,
	type Step
} from './builder';
import { PlanData } from './data.svelte';
import { candidateOf, finderItemsOf, type Candidate, type FinderItem } from './options';
import { errorText } from './source.svelte';
import type {
	RelaxOption,
	SavedRegistrationPlan,
	ScheduleCheck,
	ScheduleCount,
	ScheduleOptionsRequest
} from './types';

export type FinderResult = {
	candidates: Candidate[];
	total: number;
	capped: boolean;
	relax: RelaxOption[];
	notOffered: string[];
};

const DEBOUNCE = 300;
const RESULTS = 6;

function builderBusy(error: unknown) {
	return error instanceof ApiError && error.code === 'SCHEDULE_BUILDER_BUSY';
}

export class FinderState extends PlanData {
	step = $state<Step | null>(null);
	prefs = $state<Prefs>(defaultPrefs());
	offMode = $state<OffMode>('none');
	offDays = $state<string[]>([]);
	finderIncluded = $state<string[]>([]);
	finderResult = $state.raw<FinderResult | null>(null);
	previewIndex = $state<number | null>(null);
	count = $state.raw<ScheduleCount | null>(null);
	counting = $state(false);
	relax = $state.raw<RelaxOption[]>([]);
	finding = $state(false);
	busy = $state(false);
	builderError = $state('');
	check = $state.raw<ScheduleCheck | null>(null);
	checking = $state(false);
	checkError = $state('');

	answers = $derived<Answers>({ prefs: this.prefs, offMode: this.offMode, offDays: this.offDays });
	effective = $derived(effectivePrefs(this.answers));
	finderItems: FinderItem[] = $derived(finderItemsOf(this.suggestions, this.published));
	items = $derived.by(() => {
		const included = this.finderItems.filter(
			(item) => this.finderIncluded.includes(item.id) && !item.blocked
		);
		const covered = included.flatMap((item) => item.codes);
		const pinned = this.added
			.filter((code) => this.picks[code]?.lecture && !covered.includes(code))
			.map((code) => ({
				id: this.fills[code] ?? '',
				codes: [code],
				crns: [this.picks[code].lecture, this.picks[code].lab].filter((crn): crn is string =>
					Boolean(crn)
				)
			}));
		return [...included, ...pinned];
	});
	request = $derived<ScheduleOptionsRequest | null>(
		this.term && this.published && this.items.some((item) => !('crns' in item))
			? toScheduleRequest(this.term, this.items, this.effective)
			: null
	);
	countText = $derived(this.count ? countLabel(this.count) : '');

	#stop: () => void;
	#countTimer: ReturnType<typeof setTimeout> | undefined;
	#checkTimer: ReturnType<typeof setTimeout> | undefined;
	#countVersion = 0;
	#findVersion = 0;
	#checkVersion = 0;
	#checked = '';
	#counted = '';
	#lastBuilder: (() => void) | undefined;

	constructor(session: PanelSession) {
		super(session);
		this.#stop = $effect.root(() => {
			$effect(() => {
				const request = this.step && this.step !== 'courses' ? this.request : null;
				untrack(() => this.#queueCount(request));
			});
			$effect(() => {
				const term = this.term;
				const crns = this.published ? this.crns : [];
				untrack(() => this.#queueCheck(term, crns));
			});
		});
	}

	destroy() {
		this.#stop();
		clearTimeout(this.#countTimer);
		clearTimeout(this.#checkTimer);
	}

	#stale(version: number, current: number, term: string) {
		return !this.active() || version !== current || term !== this.term;
	}

	#queueCount(request: ScheduleOptionsRequest | null) {
		const key = request ? JSON.stringify(request) : '';
		if (key && key === this.#counted) return;
		this.#counted = key;
		clearTimeout(this.#countTimer);
		++this.#countVersion;
		if (!request) {
			this.count = null;
			this.relax = [];
			this.counting = false;
			return;
		}
		this.counting = true;
		this.#countTimer = setTimeout(() => void this.#runCount(request), DEBOUNCE);
	}

	async #runCount(request: ScheduleOptionsRequest) {
		const version = ++this.#countVersion;
		const term = this.term;
		this.#lastBuilder = () => void this.#runCount(request);
		this.counting = true;
		try {
			const count = await API.countScheduleOptions(request);
			if (this.#stale(version, this.#countVersion, term)) return;
			const relax = count.count ? [] : (await API.scheduleOptions({ ...request, limit: 1 })).relax;
			if (this.#stale(version, this.#countVersion, term)) return;
			this.count = count;
			this.relax = relax;
			this.busy = false;
			this.builderError = '';
		} catch (error) {
			if (this.#stale(version, this.#countVersion, term)) return;
			this.#counted = '';
			if (builderBusy(error)) this.busy = true;
			else this.builderError = errorText(error);
		} finally {
			if (!this.#stale(version, this.#countVersion, term)) this.counting = false;
		}
	}

	async find(): Promise<FinderResult | null> {
		const request = this.request;
		if (!request) return null;
		const version = ++this.#findVersion;
		const term = this.term;
		this.#lastBuilder = () => void this.find();
		this.finding = true;
		this.builderError = '';
		try {
			const response = await API.scheduleOptions({ ...request, limit: RESULTS });
			if (this.#stale(version, this.#findVersion, term)) return null;
			await this.fetchSections(
				term,
				response.schedules.flatMap((schedule) => schedule.crns)
			);
			if (this.#stale(version, this.#findVersion, term)) return null;
			const items = this.items.map((item) => ({ id: item.id, codes: item.codes }));
			this.finderResult = {
				candidates: response.schedules.map((schedule) =>
					candidateOf(schedule, items, (crn) => this.section(crn))
				),
				total: response.count,
				capped: response.capped,
				relax: response.relax,
				notOffered: response.not_offered
			};
			this.previewIndex = null;
			this.busy = false;
			return this.finderResult;
		} catch (error) {
			if (this.#stale(version, this.#findVersion, term)) return null;
			if (builderBusy(error)) this.busy = true;
			else this.builderError = errorText(error);
			return null;
		} finally {
			if (!this.#stale(version, this.#findVersion, term)) this.finding = false;
		}
	}

	retryBuilder() {
		this.busy = false;
		this.builderError = '';
		this.#lastBuilder?.();
	}

	applyRelax(option: Pick<RelaxOption, 'preference'>) {
		const next = relaxAnswers(option.preference, this.answers);
		this.prefs = next.prefs;
		this.offMode = next.offMode;
		this.offDays = next.offDays;
	}

	resetFinder() {
		this.finderIncluded = this.finderItems
			.filter((item) => item.required && !item.blocked)
			.map((item) => item.id);
		this.finderResult = null;
		this.previewIndex = null;
	}

	#queueCheck(term: string, crns: string[]) {
		const key = `${term}:${crns.join(',')}`;
		if (key === this.#checked) return;
		clearTimeout(this.#checkTimer);
		++this.#checkVersion;
		if (!crns.length) {
			this.#checked = key;
			this.check = null;
			this.checking = false;
			this.checkError = '';
			return;
		}
		this.checking = true;
		this.#checkTimer = setTimeout(() => void this.#runCheck(term, crns, key), DEBOUNCE);
	}

	async #runCheck(term: string, crns: string[], key: string) {
		const version = ++this.#checkVersion;
		try {
			const check = await API.scheduleCheck(term, crns);
			if (this.#stale(version, this.#checkVersion, term)) return;
			this.check = check;
			this.checkError = '';
			this.#checked = key;
		} catch (error) {
			if (this.#stale(version, this.#checkVersion, term)) return;
			this.checkError = errorText(error);
		} finally {
			if (!this.#stale(version, this.#checkVersion, term)) this.checking = false;
		}
	}

	retryCheck() {
		this.#checked = '';
		this.#queueCheck(this.term, this.published ? this.crns : []);
	}

	override selectTerm(uid: string) {
		if (!uid || uid === this.term) return;
		super.selectTerm(uid);
		this.step = null;
		this.finderResult = null;
		this.previewIndex = null;
		this.check = null;
		this.busy = false;
		this.builderError = '';
	}

	protected override onRestored(uid: string, saved: SavedRegistrationPlan | null) {
		const answers =
			saved && uid === this.term && !this.step ? answersFrom(saved.preferences) : null;
		if (!answers) return;
		this.prefs = answers.prefs;
		this.offMode = answers.offMode;
		this.offDays = answers.offDays;
	}
}
