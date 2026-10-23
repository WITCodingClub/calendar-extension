import type { BackfillName, BackfillState } from '../types';

type BackfillApi = {
	getBackfills(): Promise<BackfillState>;
	completeBackfill(name: BackfillName): Promise<BackfillState>;
};
export type BackfillResult = { complete: boolean };

export class Backfills {
	#state: BackfillState | undefined;
	#loading: Promise<BackfillState> | undefined;
	#attempted = new Set<BackfillName>();
	#pending = new Map<BackfillName, Promise<BackfillResult | undefined>>();

	constructor(
		private api: BackfillApi,
		private active: () => boolean
	) {}

	load(): Promise<BackfillState> {
		if (this.#state) return Promise.resolve(this.#state);
		if (this.#loading) return this.#loading;
		this.#loading = this.api
			.getBackfills()
			.then((state) => {
				if (this.active()) this.#state = state;
				return state;
			})
			.finally(() => {
				this.#loading = undefined;
			});
		return this.#loading;
	}

	resetAttempts(): void {
		this.#attempted.clear();
	}

	run<T extends BackfillResult>(
		name: BackfillName,
		work: () => Promise<T | undefined>,
		force = false
	): Promise<T | undefined> {
		const pending = this.#pending.get(name) as Promise<T | undefined> | undefined;
		if (pending)
			return force
				? pending.then(
						(result) => (result?.complete || !this.active() ? result : this.run(name, work, true)),
						() => this.run(name, work, true)
					)
				: pending;
		if (!this.active() || (!force && this.#attempted.has(name))) return Promise.resolve(undefined);
		this.#attempted.add(name);
		const request = (async () => {
			const state = await this.load();
			if (!this.active() || (!force && state[name].completed)) return;
			const result = await work();
			if (!result?.complete || !this.active()) return result;
			const updated = await this.api.completeBackfill(name);
			if (this.active()) {
				for (const key of ['academic_data', 'past_terms'] as const) {
					if (this.#state?.[key].completed && !updated[key].completed)
						updated[key] = this.#state[key];
				}
				this.#state = updated;
			}
			return result;
		})().finally(() => {
			this.#pending.delete(name);
		});
		this.#pending.set(name, request);
		return request;
	}
}
