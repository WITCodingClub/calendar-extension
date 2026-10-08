import type { GetPreferencesResponse } from './types';

export const PREFERENCE_CHECK_INTERVAL = 5 * 60 * 1000;

type Preferences = Map<string, GetPreferencesResponse>;
type Snapshot = { generation: number; termVersion: number };

// The panel owns this cache. Polling checks only a version token; a change
// invalidates loaded terms, whose visible owner decides when to reload them.
export class PreferenceCache {
	#version: string | undefined;
	#supported = true;
	#active = true;
	#hasTerms = false;
	#needsRefresh = false;
	#generation = 0;
	#termVersions = new Map<string, number>();
	#terms = new Map<string, { preferences: Preferences; version?: string }>();
	#pending = new Map<string, Promise<Preferences | undefined>>();
	#versionRequest: Promise<void> | undefined;
	#listeners = new Set<() => void>();

	constructor(private readonly readVersion: () => Promise<string | undefined>) {}

	start(): () => void {
		const timer = setInterval(() => {
			if (this.#supported && this.#hasTerms) {
				void this.checkVersion().catch(() => {
					// Keep the last successful version and retry at the next interval.
				});
			}
		}, PREFERENCE_CHECK_INTERVAL);
		return () => {
			clearInterval(timer);
			this.#active = false;
		};
	}

	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	checkVersion(): Promise<void> {
		if (!this.#active || !this.#supported) return Promise.resolve();
		if (this.#versionRequest) return this.#versionRequest;
		const request = this.readVersion()
			.then((version) => {
				if (!this.#active) return;
				if (version === undefined) {
					// Older servers keep the existing per-event read behavior.
					this.#supported = false;
					return;
				}
				const changed =
					(this.#version !== version && this.#hasTerms) ||
					[...this.#terms.values()].some(
						(term) => term.version !== undefined && term.version !== version
					);
				this.#version = version;
				if (changed) this.invalidateAll();
				else if (this.#needsRefresh && this.#pending.size === 0) {
					for (const listener of this.#listeners) listener();
				}
			})
			.finally(() => {
				if (this.#versionRequest === request) this.#versionRequest = undefined;
			});
		this.#versionRequest = request;
		return request;
	}

	snapshot(term: string): Snapshot {
		return { generation: this.#generation, termVersion: this.#termVersions.get(term) ?? 0 };
	}

	isCurrent(term: string, snapshot: Snapshot): boolean {
		return (
			this.#active &&
			snapshot.generation === this.#generation &&
			snapshot.termVersion === (this.#termVersions.get(term) ?? 0)
		);
	}

	get(term: string, id: number | string): GetPreferencesResponse | undefined {
		const cached = this.#terms.get(term);
		if (!this.#active || !this.#supported || cached?.version === undefined) return undefined;
		return cached.preferences.get(String(id));
	}

	isLoaded(term: string, preferences: Preferences): boolean {
		return this.#active && this.#terms.get(term)?.preferences === preferences;
	}

	async loadTerm(
		term: string,
		load: () => Promise<{
			preferences: Map<number | string, GetPreferencesResponse>;
			version?: string;
		}>
	): Promise<Preferences | undefined> {
		if (this.#version === undefined && this.#supported) {
			await this.checkVersion().catch(() => {});
		}
		if (!this.#active) return undefined;
		this.#hasTerms = true;
		const pending = this.#pending.get(term);
		if (pending) return pending;
		const snapshot = this.snapshot(term);
		const request = load()
			.then((result) => {
				if (!this.isCurrent(term, snapshot)) return undefined;
				const preferences = new Map(
					[...result.preferences].map(([id, value]) => [String(id), value])
				);
				this.#terms.set(term, { preferences, version: result.version });
				this.#needsRefresh = false;
				return preferences;
			})
			.catch((error) => {
				if (this.isCurrent(term, snapshot)) this.#needsRefresh = true;
				throw error;
			})
			.finally(() => {
				if (this.#pending.get(term) === request) this.#pending.delete(term);
			});
		this.#pending.set(term, request);
		return request;
	}

	update(term: string, id: number | string, value: GetPreferencesResponse): void {
		const cached = this.#terms.get(term);
		const preferences = new Map(cached?.preferences);
		this.invalidateTerm(term);
		preferences.set(String(id), value);
		if (this.#active) this.#terms.set(term, { preferences, version: cached?.version });
	}

	invalidateTerm(term: string): void {
		this.#termVersions.set(term, (this.#termVersions.get(term) ?? 0) + 1);
		this.#terms.delete(term);
		this.#pending.delete(term);
	}

	invalidateAll(): void {
		this.#generation += 1;
		this.#needsRefresh = true;
		this.#terms.clear();
		this.#pending.clear();
		for (const listener of this.#listeners) listener();
	}
}
