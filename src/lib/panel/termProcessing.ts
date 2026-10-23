import type { BatchProcessingResponse, isProcessed, ProcessingTerm } from '../types';

type ProcessingApi = {
	userIsProcessed(term: string): Promise<isProcessed>;
	processCoursesBatch(terms: ProcessingTerm[]): Promise<BatchProcessingResponse>;
};

export class TermProcessing {
	readonly pending = new Map<string, Promise<boolean>>();
	#polls = new Map<string, Promise<void>>();

	constructor(
		private api: ProcessingApi,
		private active: () => boolean,
		private completed: (term: string) => Promise<void>,
		private failed: (term: string, error: unknown) => void
	) {}

	async wait(term: string, status?: isProcessed, current = this.active): Promise<void> {
		await (this.pending.get(term) ?? this.#polls.get(term) ?? this.poll(term, status, current));
	}

	private async poll(term: string, status?: isProcessed, current = this.active): Promise<void> {
		const deadline = Date.now() + 180_000;
		while (current()) {
			status ??= await this.api.userIsProcessed(term);
			if (!current()) return;
			if (status.processed) return;
			if (status.status === 'failed')
				throw new Error(status.error_code || 'Term processing failed');
			if (status.status !== 'pending' && status.status !== 'processing')
				throw new Error('Term processing has not started. Fetch the calendar to retry.');
			if (Date.now() >= deadline)
				throw new Error('Term processing is not finished. Fetch the calendar to retry later.');
			await new Promise((resolve) =>
				setTimeout(resolve, Math.max(5_000, this.#polls.size * 1_000))
			);
			status = undefined;
		}
	}

	async start(
		terms: string[],
		load: (term: string) => Promise<ProcessingTerm['courses']>
	): Promise<boolean> {
		const releases = new Map<string, (complete: boolean) => void>();
		const results = [...new Set(terms)].map((term) => {
			const pending = this.pending.get(term);
			if (pending) return pending;
			const request = new Promise<boolean>((resolve) => releases.set(term, resolve));
			this.pending.set(term, request);
			return request;
		});
		const finish = async (term: string, work: () => Promise<void>) => {
			let done = false;
			try {
				await work();
				done = this.active();
			} catch (error) {
				if (this.active()) this.failed(term, error);
			} finally {
				this.pending.delete(term);
				releases.get(term)?.(done);
				releases.delete(term);
			}
		};
		try {
			const entries: ProcessingTerm[] = [];
			const existing: Promise<void>[] = [];
			for (const term of releases.keys()) {
				if (!this.active()) return false;
				try {
					const status = await this.api.userIsProcessed(term);
					if (!this.active()) return false;
					if (status.processed) {
						await finish(term, () => this.completed(term));
					} else if (status.status === 'pending' || status.status === 'processing') {
						existing.push(
							finish(term, async () => {
								await this.waitForExisting(term, status);
								if (this.active()) await this.completed(term);
							})
						);
					} else {
						const courses = await load(term);
						if (courses.length) entries.push({ term, courses });
						else await finish(term, async () => {});
					}
				} catch (error) {
					await finish(term, async () => {
						throw error;
					});
				}
			}
			for (let index = 0; index < entries.length && this.active(); index += 12) {
				const batch = entries.slice(index, index + 12);
				try {
					const response = await this.api.processCoursesBatch(batch);
					if (!this.active()) return false;
					await Promise.all(
						batch.map(({ term }) =>
							finish(term, async () => {
								const result = response.terms.find((result) => result.term === term);
								if (!result) throw new Error('Term processing returned no result');
								if (result.status === 'failed')
									throw new Error(result.error || 'Term processing failed');
								if (result.status === 'pending') await this.waitForExisting(result.term);
								if (this.active()) await this.completed(result.term);
							})
						)
					);
				} catch (error) {
					await Promise.all(
						batch.map(({ term }) =>
							finish(term, async () => {
								throw error;
							})
						)
					);
				}
			}
			await Promise.all(existing);
		} finally {
			for (const [term, release] of releases) {
				this.pending.delete(term);
				release(false);
			}
		}
		return (await Promise.all(results)).every(Boolean) && this.active();
	}

	private waitForExisting(term: string, status?: isProcessed): Promise<void> {
		const pending = this.#polls.get(term);
		if (pending) return pending;
		const request = this.poll(term, status).finally(() => this.#polls.delete(term));
		this.#polls.set(term, request);
		return request;
	}
}
