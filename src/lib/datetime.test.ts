import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateLabel } from './datetime';
import { findFreePeriods } from './friends/availability';
import type { MeetingPreferences } from './friends/types';

describe('date labels', () => {
	it.each([
		['2024-02-29', 'Thursday, Feb 29'],
		['2026-03-08', 'Sunday, Mar 8'],
		['2026-11-01', 'Sunday, Nov 1'],
		['2027-01-01', 'Friday, Jan 1']
	])('formats %s as a UTC calendar date', (date, label) => {
		expect(dateLabel(date)).toBe(label);
	});
	it.each(['', 'invalid', '2026-13-01'])('preserves invalid date output for %s', (date) => {
		expect(dateLabel(date)).toBe('Invalid Date');
	});
});

describe('free period date labels', () => {
	afterEach(() => vi.useRealTimers());
	it('labels separate free windows across days and preserves date validation', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
		const preferences: MeetingPreferences = {
			preset: 'custom',
			from: '2026-10-05',
			until: '2026-10-06',
			duration: '30',
			buffer: '0',
			dailyStart: '09:00',
			dailyEnd: '12:00',
			betweenClasses: false
		};
		const result = findFreePeriods(['you'], preferences, [], undefined, new Date(), [
			{ date: '2026-10-05', weekday: 'monday', start: '10:00', end: '11:00' }
		]);
		expect(result.periods.map(({ date, day, start, end }) => ({ date, day, start, end }))).toEqual([
			{ date: '2026-10-05', day: 'Monday, Oct 5', start: 540, end: 600 },
			{ date: '2026-10-05', day: 'Monday, Oct 5', start: 660, end: 720 },
			{ date: '2026-10-06', day: 'Tuesday, Oct 6', start: 540, end: 720 }
		]);
		expect(findFreePeriods(['you'], { ...preferences, from: '2026-02-30' }, [])).toEqual({
			periods: [],
			message: 'Choose a valid date range.'
		});
	});
});
