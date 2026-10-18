import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editorMessage, suggestedMeetings } from './planner';
import { comparisonPeople } from './comparisonData';
import { comparisonGrid, ownerColor } from './gridEvents';
import { calendarDateTime, formatCampusDate } from '../datetime';
import type { PanelUi } from '../panel/ui.svelte';
import type { ComparisonPerson } from './comparison';
import type { SavedMeetingsResponse } from './savedMeetings';

function ui(): PanelUi {
	const range = '2026-10-05:2026-10-09';
	const response = {
		time_zone: 'America/New_York',
		start_date: '2026-10-05',
		end_date: '2026-10-09',
		busy: []
	};
	return {
		now: Date.now(),
		scheduleTerm: 'term',
		hasSelectedFriends: true,
		hasAvailabilityOnly: false,
		termError: '',
		friendsError: '',
		selected: ['you', 'friend'],
		friends: [{ id: 'friend', name: 'Friend', visibility: { mine: 'full', theirs: 'full' } }],
		people: [
			{ id: 'you', name: 'You', sharing: 'Full schedule' },
			{ id: 'friend', name: 'Friend', sharing: 'Full schedule' }
		],
		preferences: {
			preset: 'this-week',
			from: '2026-10-05',
			until: '2026-10-09',
			duration: '30',
			dailyStart: '09:00',
			dailyEnd: '17:00',
			buffer: '10',
			betweenClasses: false
		},
		termBounds: { term: { start: '2026-09-01', end: '2026-12-20' } },
		week: '2026-10-05',
		scheduleStatus: { term: { you: 'loaded', friend: 'loaded' } },
		scheduleErrors: {},
		friendSchedules: { term: { friend: [] } },
		busyStatus: { [range]: { you: 'loaded', friend: 'loaded' } },
		busyErrors: {},
		busyBlocks: { [range]: { you: { ...response }, friend: { ...response } } }
	} as unknown as PanelUi;
}
describe('production planning and comparison adapters', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-06T12:00:00-04:00'));
	});
	afterEach(() => vi.useRealTimers());
	it('aligns concrete starts to 15 minutes inside each real free window', () => {
		const periods = [{ id: 'window', date: '2026-10-07', day: 'Wednesday', start: 701, end: 750 }];
		expect(suggestedMeetings(periods, 30).map((slot) => [slot.start, slot.end])).toEqual([
			[705, 735],
			[720, 750]
		]);
		expect(suggestedMeetings(periods, 0)).toEqual([]);
	});
	it('revalidates dates, hours and unavailable schedules without treating them as free', () => {
		const state = ui(),
			slot = {
				id: 'slot',
				date: '2026-10-07',
				day: 'Wednesday',
				start: '16:30',
				end: '17:00',
				window: ''
			};
		expect(editorMessage(state, [], slot)).toBeUndefined();
		state.preferences.dailyEnd = '16:00';
		expect(editorMessage(state, [], slot)).toContain('planning hours');
		state.preferences.dailyEnd = '17:00';
		state.preferences.until = '2026-10-06';
		expect(editorMessage(state, [], slot)).toContain('planning dates');
		state.preferences.until = '2026-10-09';
		state.busyBlocks = {};
		expect(editorMessage(state, [], slot)).toContain('Loading');
		state.busyStatus['2026-10-07:2026-10-07'] = { friend: 'error' };
		state.busyErrors['2026-10-07:2026-10-07'] = { friend: 'Availability rejected' };
		state.selected = ['friend'];
		expect(editorMessage(state, [], slot)).toBe('Availability rejected');
	});
	it('keeps class conflicts while removing represented meetings from anonymous busy blocks', () => {
		const state = ui();
		state.selected = ['you'];
		state.busyBlocks['2026-10-05:2026-10-09'].you.busy = [
			{ date: '2026-10-07', weekday: 'wednesday', start: '12:00', end: '13:00' }
		];
		const course = {
			title: 'Real class',
			prefix: 'TEST',
			course_number: 1,
			schedule_type: 'Lecture',
			term: { uid: 202610, season: 'Fall', year: 2026 },
			professor: null,
			meeting_times: [
				{
					id: 'class',
					begin_time: '12:15',
					end_time: '13:00',
					start_date: '2026-09-01',
					end_date: '2026-12-20',
					monday: false,
					tuesday: false,
					wednesday: true,
					thursday: false,
					friday: false,
					saturday: false,
					sunday: false,
					location: { building: null, rooms: [] }
				}
			]
		};
		const saved: SavedMeetingsResponse = {
			meetings: [
				{
					id: 'meeting',
					title: 'Saved API meeting',
					location: null,
					start_time: '2026-10-07T12:00:00-04:00',
					end_time: '2026-10-07T12:30:00-04:00',
					time_zone: 'America/New_York',
					frequency: 'one_time',
					recurrence: null,
					repeat_until: null,
					invite_friends: false,
					role: 'owner',
					can_edit: true,
					can_delete: true,
					can_leave: false,
					owner: { id: 'server-viewer-id', name: 'Viewer' },
					friends: [],
					destinations: ['ics'],
					publications: []
				}
			],
			occurrences: [
				{
					id: 'server-occurrence',
					meeting_id: 'meeting',
					start_time: '2026-10-07T12:00:00-04:00',
					end_time: '2026-10-07T12:30:00-04:00'
				}
			]
		};
		const people = comparisonPeople(state, [course], saved);
		expect(people[0].days['2026-10-07'].blocks.map((block) => block.title)).toEqual(['Real class']);
		const grid = comparisonGrid(
			people,
			['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
			'detailed',
			8,
			undefined,
			saved
		);
		expect(grid.byDay.wednesday.map((event) => event.course.title)).toEqual([
			'Saved API meeting',
			'Real class'
		]);
		const friend: ComparisonPerson = { ...people[0], id: 'friend', name: 'Friend' };
		const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
		const shared = comparisonGrid([...people, friend], dates, 'detailed', 8);
		expect(shared.byDay.wednesday).toHaveLength(1);
		expect(shared.byDay.wednesday[0].sharedOwners).toEqual([
			{ ownerId: 'you', name: 'You', color: ownerColor('you', people) },
			{ ownerId: 'friend', name: 'Friend', color: ownerColor('friend', [friend]) }
		]);
		expect(Object.values(shared.details)[0].shared?.map(({ person }) => person.id)).toEqual([
			'you',
			'friend'
		]);
		expect(
			comparisonGrid([...people, { ...friend, sharing: 'Availability only' }], dates, 'detailed', 8)
				.byDay.wednesday
		).toHaveLength(2);
	});
	it('hides private details and omits failed calendars', () => {
		const state = ui();
		state.selected = ['friend'];
		state.people[1].sharing = 'Availability only';
		state.busyBlocks['2026-10-05:2026-10-09'].friend.busy = [
			{ date: '2026-10-07', weekday: 'wednesday', start: '09:00', end: '10:00' }
		];
		const people = comparisonPeople(state, [], { meetings: [], occurrences: [] });
		expect(people[0].days['2026-10-07'].blocks).toEqual([
			{ id: 'busy-2026-10-07-540-600', start: 540, end: 600 }
		]);
		state.busyBlocks = {};
		state.busyStatus['2026-10-05:2026-10-09'].friend = 'error';
		expect(
			comparisonPeople(state, [], { meetings: [], occurrences: [] })[0].days['2026-10-07']
		).toMatchObject({ status: 'error', blocks: [] });
	});
	it('keeps event identities and colors independent of selection order', () => {
		const people: ComparisonPerson[] = ['a', 'b'].map((id) => ({
			id,
			name: id,
			sharing: 'Full schedule',
			days: {
				'2026-10-07': {
					status: 'ready',
					blocks: [{ id: 'shared-id', title: id, start: 540, end: 600 }]
				}
			}
		}));
		const grid = comparisonGrid(
			people,
			['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
			'detailed',
			8
		);
		expect(
			Object.values(grid.details)
				.map((detail) => detail.person?.id)
				.sort()
		).toEqual(['a', 'b']);
		expect(ownerColor('b', people)).toBe(ownerColor('b', [people[1]]));
	});
	it('preserves DST validation for production dates', () => {
		expect(formatCampusDate('2026-11-12')).toBe(formatCampusDate('2026-11-12T17:00:00Z'));
		expect(calendarDateTime('2026-11-02', '09:00')).toBe('2026-11-02T14:00:00.000Z');
		expect(calendarDateTime('2026-10-30', '09:00')).toBe('2026-10-30T13:00:00.000Z');
		expect(() => calendarDateTime('2026-03-08', '02:30')).toThrow('does not exist');
	});
});
