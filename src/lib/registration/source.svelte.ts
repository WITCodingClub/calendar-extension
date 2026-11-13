import { ApiError } from '../api/client';
import type { CatalogSection, NextTermCourses, SavedRegistrationPlan } from './types';

export function errorText(error: unknown) {
	return error instanceof Error && error.message
		? error.message
		: 'Something went wrong. Try again.';
}

export class Source<T> {
	data = $state.raw<T>();
	loading = $state(false);
	error = $state('');
	code = $state<string>();
	#version = 0;
	#run: (() => Promise<T>) | undefined;
	#after: ((value: T) => void) | undefined;
	readonly #active: () => boolean;

	constructor(active: () => boolean) {
		this.#active = active;
	}

	get loaded() {
		return this.data !== undefined;
	}

	get started() {
		return this.#run !== undefined;
	}

	async load(run: () => Promise<T>, after?: (value: T) => void): Promise<T | undefined> {
		this.#run = run;
		this.#after = after;
		const version = ++this.#version;
		this.loading = true;
		this.error = '';
		this.code = undefined;
		try {
			const value = await run();
			if (!this.#active() || version !== this.#version) return undefined;
			this.data = value;
			this.loading = false;
			after?.(value);
			return value;
		} catch (error) {
			if (!this.#active() || version !== this.#version) return undefined;
			this.error = errorText(error);
			this.code = error instanceof ApiError ? error.code : undefined;
			this.loading = false;
			return undefined;
		}
	}

	set(value: T, run: () => Promise<T>) {
		this.#run = run;
		++this.#version;
		this.data = value;
		this.loading = false;
		this.error = '';
	}

	retry(): Promise<T | undefined> {
		return this.#run ? this.load(this.#run, this.#after) : Promise.resolve(undefined);
	}
}

export class TermSources {
	readonly courses: Source<NextTermCourses>;
	readonly saved: Source<SavedRegistrationPlan | null>;
	readonly catalog: Source<CatalogSection[]>;
	extra = $state.raw<CatalogSection[]>([]);

	constructor(active: () => boolean, courses?: Source<NextTermCourses>) {
		this.courses = courses ?? new Source(active);
		this.saved = new Source(active);
		this.catalog = new Source(active);
	}

	sections(): CatalogSection[] {
		const known = (this.catalog.data ?? []).map((section) => section.crn);
		return [
			...(this.catalog.data ?? []),
			...this.extra.filter((section) => !known.includes(section.crn))
		];
	}

	addSections(sections: CatalogSection[]) {
		const known = this.sections().map((section) => section.crn);
		const fresh = sections.filter(
			(section, index) =>
				!known.includes(section.crn) &&
				sections.findIndex((other) => other.crn === section.crn) === index
		);
		if (fresh.length) this.extra = [...this.extra, ...fresh];
	}
}
