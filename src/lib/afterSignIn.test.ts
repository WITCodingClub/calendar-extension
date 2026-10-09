import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn(async (_url: string) => {});
vi.mock('$app/navigation', () => ({ goto: (url: string) => goto(url) }));
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('./api', () => ({
	API: { getConnectedAccounts: vi.fn(async () => ({ oauth_credentials: [] })) }
}));
vi.mock('./passkeys', () => ({
	passkeysSupported: vi.fn(async () => false),
	listPasskeys: vi.fn(async () => [])
}));

const telemetry = vi.hoisted(() => ({ asked: false }));
vi.mock('./telemetry', () => ({ usageStatsAsked: vi.fn(async () => telemetry.asked) }));

import { continueAfterSignIn } from './afterSignIn';
import { TermProcessing } from './panelSession';
import type { BatchProcessingResponse, isProcessed } from './types';

let storage: Record<string, unknown>;

beforeEach(() => {
	storage = {};
	telemetry.asked = false;
	goto.mockClear();
	vi.stubGlobal('chrome', {
		storage: {
			local: {
				get: vi.fn(async (key: string) => (key in storage ? { [key]: storage[key] } : {})),
				set: vi.fn(async (items: Record<string, unknown>) => {
					Object.assign(storage, items);
				}),
				remove: vi.fn(async (key: string) => {
					delete storage[key];
				})
			}
		}
	});
});

describe('continueAfterSignIn', () => {
	it('asks about usage counts first, and keeps the passkey offer for later', async () => {
		await continueAfterSignIn({ offerPasskey: true });

		expect(goto).toHaveBeenCalledWith('/usage-stats');
		expect(storage.offer_passkey_setup).toBe(true);
	});

	it('goes on to onboarding after the student chose', async () => {
		telemetry.asked = true;

		await continueAfterSignIn();

		expect(goto).toHaveBeenCalledWith('/onboard');
	});
});

afterEach(() => vi.useRealTimers());

function setup() {
	const api = {
		userIsProcessed: vi.fn<(_term: string) => Promise<isProcessed>>(async () => ({
			processed: false,
			status: 'not_started'
		})),
		processCoursesBatch: vi.fn(
			async (terms): Promise<BatchProcessingResponse> => ({
				user_pub: 'test',
				ics_url: 'test',
				terms: terms.map(({ term }: { term: string }) => ({ term, status: 'processed' }))
			})
		)
	};
	let active = true;
	const completed = vi.fn<(_term: string) => Promise<void>>(async () => {});
	const failed = vi.fn();
	const load = vi.fn(async (term: string) => [{ crn: '12345', term, courseNumber: '1000' }]);
	const processing = new TermProcessing(api, () => active, completed, failed);
	return {
		api,
		completed,
		failed,
		load,
		processing,
		stop: () => {
			active = false;
		}
	};
}

it('deduplicates terms, skips processed and empty terms, and respects the 12-term limit', async () => {
	const s = setup();
	s.api.userIsProcessed.mockImplementation(async (term) => ({ processed: term === 'old' }));
	s.load.mockImplementation(async (term) =>
		term === 'empty' ? [] : [{ crn: '12345', term, courseNumber: '1000' }]
	);
	const terms = Array.from({ length: 13 }, (_, index) => String(202010 + index));
	await s.processing.start(['old', 'empty', ...terms, terms[0]], s.load);
	expect(s.api.processCoursesBatch.mock.calls.map(([batch]) => batch.length)).toEqual([12, 1]);
	expect(s.load).not.toHaveBeenCalledWith('old');
	expect(s.completed).toHaveBeenCalledTimes(14);
	expect(s.failed).not.toHaveBeenCalled();
	expect(s.processing.pending.size).toBe(0);
});

it('waits for queued terms, isolates failures, and lets a completed term unblock before the others', async () => {
	vi.useFakeTimers();
	const s = setup();
	let submitted = false;
	let ready = false;
	s.api.userIsProcessed.mockImplementation(async (term) =>
		submitted
			? {
					processed: term === 'queued' && ready,
					status: term === 'queued' ? (ready ? 'processed' : 'processing') : 'failed',
					error_code: 'banner_unavailable'
				}
			: { processed: false, status: 'not_started' }
	);
	s.api.processCoursesBatch.mockImplementation(async () => {
		submitted = true;
		return {
			user_pub: 'test',
			ics_url: 'test',
			terms: [
				{ term: 'now', status: 'processed' },
				{ term: 'queued', status: 'pending' },
				{ term: 'failed', status: 'pending' }
			]
		};
	});
	const run = s.processing.start(['now', 'queued', 'failed'], s.load);
	const current = s.processing.wait('now');
	await vi.advanceTimersByTimeAsync(0);
	await current;
	expect(s.completed.mock.calls.flat()).toEqual(['now']);
	expect(s.processing.pending.has('queued')).toBe(true);
	ready = true;
	await vi.advanceTimersByTimeAsync(5_000);
	await run;
	expect(s.completed.mock.calls.flat()).toEqual(['now', 'queued']);
	expect(s.failed).toHaveBeenCalledWith(
		'failed',
		expect.objectContaining({ message: 'banner_unavailable' })
	);
	expect(s.processing.pending.size).toBe(0);
});

it('resumes existing jobs without resubmitting or scraping and shares polling with the selected term', async () => {
	vi.useFakeTimers();
	const s = setup();
	s.api.userIsProcessed
		.mockResolvedValueOnce({ processed: false, status: 'processing' })
		.mockResolvedValue({ processed: true, status: 'processed' });
	const run = s.processing.start(['term'], s.load);
	const wait = s.processing.wait('term');
	await vi.advanceTimersByTimeAsync(5_000);
	await Promise.all([run, wait]);
	expect(s.api.processCoursesBatch).not.toHaveBeenCalled();
	expect(s.load).not.toHaveBeenCalled();
	expect(s.api.userIsProcessed).toHaveBeenCalledTimes(2);
	expect(s.completed).toHaveBeenCalledWith('term');
});

it('stops polling at three minutes and clears pending state so a retry can submit again', async () => {
	vi.useFakeTimers();
	const s = setup();
	s.api.userIsProcessed.mockResolvedValue({ processed: false, status: 'pending' });
	const run = s.processing.start(['term'], s.load);
	await vi.advanceTimersByTimeAsync(180_000);
	await run;
	expect(s.failed).toHaveBeenCalledWith(
		'term',
		expect.objectContaining({ message: expect.stringContaining('not finished') })
	);
	s.api.userIsProcessed.mockResolvedValue({ processed: false, status: 'failed' });
	await s.processing.start(['term'], s.load);
	expect(s.api.processCoursesBatch).toHaveBeenCalledTimes(1);
	expect(s.completed).toHaveBeenCalledTimes(1);
});

it('ignores a late batch response after the session ends', async () => {
	const s = setup();
	let release!: (response: BatchProcessingResponse) => void;
	s.api.processCoursesBatch.mockImplementation(
		() =>
			new Promise((resolve) => {
				release = resolve;
			})
	);
	const run = s.processing.start(['term'], s.load);
	await vi.waitFor(() => expect(s.api.processCoursesBatch).toHaveBeenCalledTimes(1));
	s.stop();
	release({ user_pub: 'test', ics_url: 'test', terms: [{ term: 'term', status: 'processed' }] });
	await run;
	expect(s.completed).not.toHaveBeenCalled();
	expect(s.failed).not.toHaveBeenCalled();
	expect(s.processing.pending.size).toBe(0);
});
