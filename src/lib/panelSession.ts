import { getContext, setContext } from 'svelte';
import { API } from './api';
import { PreferenceCache } from './preferenceCache';
import type { PasskeySummary } from './passkeys';
import type { Course, Friend, ProcessedEvents, TermResponse, isProcessed, ProcessingTerm, BatchProcessingResponse } from './types';
import type { FriendGroup } from './components/friends/types';
import type { SavedMeetingsResponse } from './savedMeetings';
import { busyRangeKey, type BusyBlocksResponse } from './friendSchedule';
import { processedData, icsUrl } from './store';
import { get } from 'svelte/store';
import { snackbar } from 'm3-svelte';

export type ConnectedAccount = {
    id: string;
    email: string;
    provider: string;
    needs_reauth: boolean;
    token_revoked: boolean;
};

export type SettingsData = {
    email: string | undefined;
    notificationsDisabled: boolean;
    connectedAccounts: ConnectedAccount[];
    canUsePasskeys: boolean;
    passkeys: PasskeySummary[];
    uniCalColor: string;
    uniCalReminderMode: "default" | "off" | "custom";
    uniCalReminderOffset: string;
};

// The data that the calendar and friends pages load once. The (panel) layout
// owns one session and keeps it while the user moves between those pages.
// The session ends when the panel closes, when the user leaves those pages,
// or when the environment changes. A reply that arrives after that writes into
// the old session, which no page reads.
export class PanelSession {
    // False after the session ended. Check it before a write to a store that
    // outlives the session, such as userSettings.
    active = true;
    ownScheduleProcessed: ((term: string) => void) | undefined;
    readonly termProcessing = new TermProcessing(
        API,
        () => this.active,
        async (term) => {
            this.invalidateOwnSchedule(term);
            const version = this.ownScheduleVersions[term];
            const events = await this.loadProcessedEvents(term);
            if (!this.active || this.ownScheduleVersions[term] !== version) return;
            processedData.update((data) => [
                ...data.filter((entry) => String(entry.termId) !== term),
                { termId: term, responseData: { classes: events.classes, ics_url: get(icsUrl) ?? '' } }
            ]);
            this.ownScheduleProcessed?.(term);
        },
        (term, error) => {
            console.error(`Failed to process term ${term}`, error);
            snackbar(`Could not import term ${term}: ${error}. Select the term and fetch the calendar to retry.`, undefined, true);
        }
    );

    // True after the calendar page loaded the user settings.
    calendarLoaded = false;
    // Terms whose processed events this session already asked for.
    readonly attemptedTerms = new Set<string>();
    // Terms whose meeting time preferences loaded in this session.
    readonly refreshedTerms = new Set<string>();
    readonly preferences = new PreferenceCache(() => API.getPreferenceVersion());

    settings: SettingsData | undefined;

    // Accepted friends. Friend requests are not kept, because they change when
    // other users act.
    friends: Friend[] | undefined;
    groups: FriendGroup[] | undefined;
    readonly savedMeetings = new Map<string, SavedMeetingsResponse>();
    readonly pendingSavedMeetings = new Map<string, Promise<SavedMeetingsResponse>>();
    // Mapped courses by term id, then by friend id.
    readonly schedules: Record<string, Record<string, Course[]>> = {};
    readonly busyBlocks = new Map<string, BusyBlocksResponse>();
    readonly pendingBusyBlocks = new Map<string, Promise<BusyBlocksResponse>>();
    readonly busyVersions: Record<string, number> = {};

    invalidateBusyBlocks(id: string): void {
        this.busyVersions[id] = (this.busyVersions[id] ?? 0) + 1;
        for (const cache of [this.busyBlocks, this.pendingBusyBlocks]) {
            for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key);
        }
    }

    loadBusyBlocks(id: string, from: string, until: string): Promise<BusyBlocksResponse> {
        const key = `${id}:${busyRangeKey(from, until)}`;
        const cached = this.busyBlocks.get(key);
        if (cached) return Promise.resolve(cached);
        for (const [cachedKey, data] of this.busyBlocks) {
            if (cachedKey.startsWith(`${id}:`) && data.start_date <= from && data.end_date >= until) return Promise.resolve({ ...data, start_date: from, end_date: until, busy: data.busy.filter((block) => block.date >= from && block.date <= until) });
        }
        const pending = this.pendingBusyBlocks.get(key);
        if (pending) return pending;
        for (const [pendingKey, request] of this.pendingBusyBlocks) {
            const [person, start, end] = pendingKey.split(':');
            if (person === id && start <= from && end >= until) return request.then((data) => ({ ...data, start_date: from, end_date: until, busy: data.busy.filter((block) => block.date >= from && block.date <= until) }));
        }
        const version = this.busyVersions[id] ?? 0;
        const request = API.getBusyBlocks(id, from, until).then((data) => {
            if (this.active && (this.busyVersions[id] ?? 0) === version) this.busyBlocks.set(key, data);
            return data;
        }).finally(() => {
            if (this.pendingBusyBlocks.get(key) === request) this.pendingBusyBlocks.delete(key);
        });
        this.pendingBusyBlocks.set(key, request);
        return request;
    }

    #terms: Promise<TermResponse> | undefined;
    #processed = new Map<string, Promise<ProcessedEvents>>();
    readonly ownScheduleVersions: Record<string, number> = {};

    invalidateOwnSchedule(term: string): void {
        this.invalidateBusyBlocks('you');
        this.ownScheduleVersions[term] = (this.ownScheduleVersions[term] ?? 0) + 1;
        this.#processed.delete(term);
        this.preferences.invalidateTerm(term);
        this.refreshedTerms.delete(term);
    }

    loadProcessedEvents(term: string): Promise<ProcessedEvents> {
        const pending = this.#processed.get(term);
        if (pending) return pending;
        const request = API.getProcessedEvents(term).finally(() => {
            if (this.#processed.get(term) === request) this.#processed.delete(term);
        });
        this.#processed.set(term, request);
        return request;
    }

    // Both pages need the terms. They share one request, and a failed request
    // is not kept, so the next call tries again.
    loadTerms(force = false): Promise<TermResponse> {
        if (force) this.#terms = undefined;
        if (this.#terms) return this.#terms;
        const request = API.getTerms().catch((error) => {
            if (this.#terms === request) this.#terms = undefined;
            throw error;
        });
        this.#terms = request;
        return request;
    }

    // Changes loaded settings data. Does nothing before a full load, so a
    // change never makes partial data look complete.
    updateSettings(patch: Partial<SettingsData>): void {
        if (this.settings) {
            this.settings = { ...this.settings, ...patch };
        }
    }
}

const KEY = Symbol('panelSession');

export function setPanelSession(current: () => PanelSession): void {
    setContext(KEY, current);
}

// Call during component setup. The layout mounts the pages again when it
// starts a new session, so a component keeps one session for its whole life.
export function getPanelSession(): PanelSession {
    return getContext<() => PanelSession>(KEY)();
}

type ProcessingApi = {
	userIsProcessed(term: string): Promise<isProcessed>;
	processCoursesBatch(terms: ProcessingTerm[]): Promise<BatchProcessingResponse>;
};

export class TermProcessing {
	readonly pending = new Map<string, Promise<void>>();
	#polls = new Map<string, Promise<void>>();

	constructor(
		private api: ProcessingApi,
		private active: () => boolean,
		private completed: (term: string) => Promise<void>,
		private failed: (term: string, error: unknown) => void
	) {}

	wait(term: string, status?: isProcessed): Promise<void> {
		const pending = this.pending.get(term) ?? this.#polls.get(term);
		if (pending) return pending;
		return this.waitForExisting(term, status);
	}

	private async poll(term: string, status?: isProcessed): Promise<void> {
		const deadline = Date.now() + 180_000;
		while (this.active()) {
			status ??= await this.api.userIsProcessed(term);
			if (!this.active()) return;
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
	): Promise<void> {
		const releases = new Map<string, () => void>();
		for (const term of new Set(terms)) {
			if (this.pending.has(term)) continue;
			this.pending.set(term, new Promise((resolve) => releases.set(term, resolve)));
		}
		const finish = async (term: string, work: () => Promise<void>) => {
			try {
				await work();
			} catch (error) {
				if (this.active()) this.failed(term, error);
			} finally {
				this.pending.delete(term);
				releases.get(term)?.();
			}
		};
		try {
			const entries: ProcessingTerm[] = [];
			const existing: Promise<void>[] = [];
			for (const term of releases.keys()) {
				if (!this.active()) return;
				try {
					const status = await this.api.userIsProcessed(term);
					if (!this.active()) return;
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
					if (!this.active()) return;
					await Promise.all(
						response.terms.map((result) =>
							finish(result.term, async () => {
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
				release();
			}
		}
	}

	private waitForExisting(term: string, status?: isProcessed): Promise<void> {
		const pending = this.#polls.get(term);
		if (pending) return pending;
		const request = this.poll(term, status).finally(() => this.#polls.delete(term));
		this.#polls.set(term, request);
		return request;
	}
}
