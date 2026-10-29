import { describe, expect, it } from 'vitest';
import { meetsOn, stackMeetings, syntheticCourse } from './layout';
import { weekDates } from '../datetime';
import { dayClasses, schedulingClasses } from '../friends/availability';
import { mapFriendCourses } from '../friends/schedule';
import type { MeetingTime } from '../types';

const meeting: MeetingTime = {
	id: 'class',
	begin_time: '10:00',
	end_time: '11:00',
	start_date: '2026-09-08T00:00:00.000-04:00',
	end_date: '2026-12-15T00:00:00.000-05:00',
	effective_end_date: '2026-12-07',
	excluded_dates: ['2026-10-12'],
	location: { building: null, rooms: [] },
	monday: true,
	tuesday: false,
	wednesday: false,
	thursday: false,
	friday: false,
	saturday: false,
	sunday: false
};

describe('class meeting dates', () => {
	it('stops at the effective end date and skips excluded dates', () => {
		expect(meetsOn(meeting, '2026-09-08')).toBe(true);
		expect(meetsOn(meeting, '2026-10-12')).toBe(false);
		expect(meetsOn(meeting, '2026-12-07')).toBe(true);
		expect(meetsOn(meeting, '2026-12-14')).toBe(false);
		expect(meetsOn(meeting, '2027-01-04')).toBe(false);
	});

	it('falls back to the stored end date without the backend fields', () => {
		const stored = { ...meeting, effective_end_date: undefined, excluded_dates: undefined };
		expect(meetsOn(stored, '2026-10-12')).toBe(true);
		expect(meetsOn(stored, '2026-12-14')).toBe(true);
		expect(meetsOn(stored, '2026-12-21')).toBe(false);
	});

	it('leaves classes off the calendar during and after finals', () => {
		const courses = [syntheticCourse('Class', meeting)];
		const options = { startHour: 8, historic: false, labColor: '#000', lectureColor: '#000' };
		const week = (date: string) =>
			stackMeetings(courses, { ...options, dates: weekDates(date) }).byDay.monday;
		expect(week('2026-12-07')).toHaveLength(1);
		expect(week('2026-12-14')).toHaveLength(0);
		expect(week('2026-10-12')).toHaveLength(0);
	});

	it('keeps the fields for friends and planning', () => {
		const [course] = mapFriendCourses(
			{
				classes: [
					{
						title: 'Class',
						meeting_times: [{ ...meeting, location: { building: null, rooms: [] } }]
					}
				]
			},
			'friend'
		);
		expect(course.meeting_times[0].effective_end_date).toBe('2026-12-07');
		const classes = schedulingClasses([course], 'friend');
		expect(dayClasses('2026-12-07', ['friend'], classes)).toHaveLength(1);
		expect(dayClasses('2026-12-14', ['friend'], classes)).toHaveLength(0);
		expect(dayClasses('2026-10-12', ['friend'], classes)).toHaveLength(0);
		expect(() =>
			mapFriendCourses(
				{ classes: [{ title: 'Class', meeting_times: [{ ...meeting, excluded_dates: ['x'] }] }] },
				'friend'
			)
		).toThrow('Invalid class excluded dates returned.');
	});
});
