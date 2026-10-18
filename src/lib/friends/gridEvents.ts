import { DAYS, dayFlags } from '$lib/calendar/days';
import { positionEvents, syntheticCourse } from '$lib/calendar/layout';
import { textColor } from '$lib/calendar/colors';
import { savedMeetingCourses, type SavedMeetingsResponse } from '$lib/friends/savedMeetings';
import { busyEndMinutes } from '$lib/friends/schedule';
import { minutesTime, timeMinutes } from '$lib/datetime';
import { mergeBusy } from './availability';
import {
	type ComparisonMode,
	type ComparisonGridEvent,
	type ComparisonBlock,
	type ComparisonPeriod,
	type ComparisonPerson,
	type ComparisonProposal
} from './comparison';

const ownerPalette = ['#3f51b5', '#0b8043', '#8e24aa', '#f4511e', '#00897b', '#e67c73'];
export const ownerColor = (id: string, people: ComparisonPerson[]) => {
	const explicit = people.find((person) => person.id === id)?.color;
	if (explicit) return explicit;
	let hash = 0;
	for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	return ownerPalette[hash % ownerPalette.length];
};
export type ComparisonDetail = {
	date: string;
	shared?: { person: ComparisonPerson; block: ComparisonBlock }[];
	period?: ComparisonPeriod;
	person?: ComparisonPerson;
	block?: ComparisonBlock;
};

export function comparisonGrid(
	people: ComparisonPerson[],
	dates: string[],
	mode: ComparisonMode,
	startHour: number,
	proposal?: ComparisonProposal,
	savedMeetings?: SavedMeetingsResponse
) {
	const details: Record<string, ComparisonDetail> = {};
	const byDay: Record<string, ComparisonGridEvent[]> = {};
	const savedCourses = savedMeetings ? savedMeetingCourses(savedMeetings, dates) : [];
	for (const day of DAYS.slice(0, 5)) {
		const date = dates[day.order];
		const events: ComparisonGridEvent[] = [];
		function add(id: string, title: string, start: number, end: number, owner?: ComparisonPerson) {
			const course = syntheticCourse(title, {
				id,
				begin_time: minutesTime(start),
				end_time: minutesTime(end),
				start_date: date,
				end_date: date,
				...dayFlags(day.key),
				location: { building: { name: '', abbreviation: '' }, rooms: [] }
			});
			const color = owner
				? ownerColor(owner.id, people)
				: 'rgb(var(--m3-scheme-surface-container-highest))';
			const event: ComparisonGridEvent = {
				course,
				meeting: course.meeting_times[0],
				startOffset: (start - startHour * 60) / 7.5,
				width: (end - start) / 7.5,
				bgColor: color,
				textColor: owner ? textColor(color) : 'rgb(var(--m3-scheme-on-surface))',
				stackIndex: 0,
				overlapCount: 1,
				ownerId: owner?.id,
				ownerLabel: owner?.name
			};
			events.push(event);
			return event;
		}
		const loaded = people.filter(
			(person) => person.sharing !== 'Sharing unavailable' && person.days[date]?.status === 'ready'
		);
		if (mode === 'group') {
			const periods = mergeBusy(
				loaded.flatMap((person) =>
					person.days[date].blocks.filter((block) => block.kind !== 'buffer')
				)
			);
			for (const [index, period] of periods.entries()) {
				const id = `group-${date}-${index}`;
				const owners = loaded.filter((person) =>
					person.days[date].blocks.some(
						(block) =>
							block.kind !== 'buffer' && block.start < period.end && block.end > period.start
					)
				);
				const event = add(id, 'Group · Busy', period.start, period.end);
				event.ownerStrips = owners.map((person) => ({
					ownerId: person.id,
					name: person.name,
					color: ownerColor(person.id, people),
					intervals: mergeBusy(
						person.days[date].blocks
							.filter(
								(block) =>
									block.kind !== 'buffer' && block.start < period.end && block.end > period.start
							)
							.map((block) => ({
								start: Math.max(block.start, period.start),
								end: Math.min(block.end, period.end)
							}))
					)
				}));
				details[id] = { date, period: { ...period, people: owners.map((person) => person.id) } };
			}
		} else {
			const classes = new Map<string, ComparisonGridEvent>();
			for (const person of loaded)
				for (const block of person.days[date].blocks.filter((block) => block.kind !== 'buffer')) {
					const id = JSON.stringify(['busy', person.id, date, block.id]);
					const key =
						person.sharing === 'Full schedule' && block.course?.prefix
							? JSON.stringify([
									block.start,
									block.end,
									block.course.prefix,
									block.course.course_number,
									block.course.schedule_type
								])
							: undefined;
					const existing = key ? classes.get(key) : undefined;
					if (existing && existing.ownerId !== person.id) {
						const detail = details[String(existing.meeting.id)];
						detail.shared ??= [{ person: detail.person!, block: detail.block! }];
						detail.shared.push({ person, block });
						existing.sharedOwners = detail.shared.map(({ person }) => ({
							ownerId: person.id,
							name: person.name,
							color: ownerColor(person.id, people)
						}));
						existing.ownerLabel = existing.sharedOwners.map((owner) => owner.name).join(', ');
						continue;
					}
					const event = add(
						id,
						person.sharing === 'Availability only' ? 'Busy' : block.title || 'Busy',
						block.start,
						block.end,
						person
					);

					details[id] = { date, person, block };
					if (key) classes.set(key, event);
				}
		}
		if (savedMeetings) {
			for (const course of savedCourses) {
				const time = course.meeting_times[0];
				if (!time[day.key] || time.start_date !== date) continue;
				const occurrence = savedMeetings.occurrences.find((item) => item.id === time.id)!;
				const meeting = savedMeetings.meetings.find((item) => item.id === occurrence.meeting_id)!;
				const participantIds = [meeting.owner.id, ...meeting.friends.map((friend) => friend.id)];
				if (!people.some((person) => person.id === 'you' || participantIds.includes(person.id)))
					continue;
				const event = add(
					JSON.stringify(['meeting', occurrence.id, date]),
					meeting.title,
					timeMinutes(time.begin_time)!,
					busyEndMinutes(time.end_time)!
				);
				event.savedMeeting = { meeting, occurrence };
				event.bgColor = 'rgb(var(--m3-scheme-tertiary-container))';
				event.textColor = 'rgb(var(--m3-scheme-on-tertiary-container))';
			}
		}
		if (proposal?.date === date) {
			const event = add('proposed-meeting', 'Proposed meeting', proposal.start, proposal.end);
			event.preview = true;
			event.bgColor = 'rgb(var(--m3-scheme-primary-container) / .7)';
			event.textColor = 'rgb(var(--m3-scheme-on-primary-container))';
		}
		const positioned = positionEvents(
			events
				.filter((item) => !item.preview)
				.map((item) => ({
					...item,
					startOffset: Math.round(item.startOffset * 7.5),
					width: Math.round(item.width * 7.5)
				}))
		).map((item) => ({ ...item, startOffset: item.startOffset / 7.5, width: item.width / 7.5 }));
		const highlighted = events
			.filter((item) => item.preview)
			.map((item) => ({
				...item,
				overlapCount: Math.max(1, ...positioned.map((event) => event.overlapCount))
			}));
		byDay[day.key] = [...positioned, ...highlighted];
	}
	return { byDay, details };
}
