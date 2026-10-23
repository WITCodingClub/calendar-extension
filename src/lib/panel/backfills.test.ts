import { expect, it, vi } from 'vitest';
import { Backfills } from './backfills';
import type { BackfillState } from '../types';

function state(completed = false): BackfillState {
	return {
		academic_data: { completed, completed_at: completed ? '2026-10-23T12:00:00Z' : null },
		past_terms: { completed: false, completed_at: null }
	};
}
function setup(completed = false) {
	const api = {
		getBackfills: vi.fn(async () => state(completed)),
		completeBackfill: vi.fn(async () => state(true))
	};
	let active = true;
	return {
		api,
		runner: new Backfills(api, () => active),
		stop: () => {
			active = false;
		}
	};
}

it('reads one shared state and skips academic work already recorded on the account', async () => {
	const s = setup(true);
	const work = vi.fn(async () => ({ complete: true }));
	await s.runner.run('academic_data', work);
	await s.runner.load();
	expect(s.api.getBackfills).toHaveBeenCalledTimes(1);
	expect(work).not.toHaveBeenCalled();
	expect(s.api.completeBackfill).not.toHaveBeenCalled();
});

it('deduplicates concurrent runs and marks completion only after success', async () => {
	const s = setup();
	let finish!: () => void;
	const work = vi.fn(async () => {
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
		return { complete: true, value: 'saved' };
	});
	const first = s.runner.run('academic_data', work);
	const second = s.runner.run('academic_data', work);
	await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
	expect(s.api.completeBackfill).not.toHaveBeenCalled();
	finish();
	expect(await first).toEqual({ complete: true, value: 'saved' });
	await second;
	expect(s.api.completeBackfill).toHaveBeenCalledExactlyOnceWith('academic_data');
});

it.each([false, undefined])('does not mark incomplete or cancelled work: %s', async (complete) => {
	const s = setup();
	await s.runner.run('academic_data', async () =>
		complete === undefined ? undefined : { complete }
	);
	expect(s.api.completeBackfill).not.toHaveBeenCalled();
});

it('retries failed work on the next panel open instead of recording or repeatedly retrying it', async () => {
	const s = setup();
	const work = vi.fn(async () => {
		throw new Error('LeopardWeb unavailable');
	});
	await expect(s.runner.run('academic_data', work)).rejects.toThrow('LeopardWeb unavailable');
	await s.runner.run('academic_data', work);
	expect(work).toHaveBeenCalledTimes(1);
	expect(s.api.completeBackfill).not.toHaveBeenCalled();
	const next = new Backfills(s.api, () => true);
	await expect(next.run('academic_data', work)).rejects.toThrow();
	expect(work).toHaveBeenCalledTimes(2);
});

it('ignores late success after an account or environment change', async () => {
	const s = setup();
	await s.runner.run('academic_data', async () => {
		s.stop();
		return { complete: true };
	});
	expect(s.api.completeBackfill).not.toHaveBeenCalled();
});

it('allows explicit syncing after completion and surfaces marker failures for retry', async () => {
	const s = setup(true);
	s.api.completeBackfill.mockRejectedValueOnce(new Error('Marker unavailable'));
	const work = vi.fn(async () => ({ complete: true }));
	await expect(s.runner.run('academic_data', work, true)).rejects.toThrow('Marker unavailable');
	await s.runner.run('academic_data', work, true);
	expect(work).toHaveBeenCalledTimes(2);
});

it('lets the initial full sync retry an incomplete overlapping automatic run', async () => {
	const s = setup();
	let finish!: () => void;
	const first = s.runner.run('academic_data', async () => {
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
		return { complete: false };
	});
	await vi.waitFor(() => expect(finish).toBeDefined());
	const work = vi.fn(async () => ({ complete: true }));
	const initial = s.runner.run('academic_data', work, true);
	finish();
	await Promise.all([first, initial]);
	expect(work).toHaveBeenCalledTimes(1);
	expect(s.api.completeBackfill).toHaveBeenCalledTimes(1);
});
