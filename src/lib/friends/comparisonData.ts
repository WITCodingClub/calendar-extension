import { DAYS } from '../calendar/days';
import { meetsOn } from '../calendar/layout';
import { timeMinutes, weekDates, hasExpired } from '../datetime';
import { mergeBusy } from './availability';
import { busyEndMinutes, busyForRange, busyRangeKey } from './schedule';
import { savedMeetingCourses, type SavedMeetingsResponse } from './savedMeetings';
import type { PanelUi } from '../panel/ui.svelte';
import type { Course } from '../types';
import type { ComparisonBlock, ComparisonPerson } from './comparison';

export function comparisonPeople(
	ui: PanelUi,
	ownCourses: Course[],
	saved: SavedMeetingsResponse
): ComparisonPerson[] {
	const dates = weekDates(ui.week);
	const range = busyRangeKey(dates[0], dates[4]);
	const savedCourses = savedMeetingCourses(saved, dates);
	return ui.people
		.filter((person) => ui.selected.includes(person.id))
		.map((person) => {
			const response = busyForRange(ui.busyBlocks, person.id, dates[0], dates[4]);
			const scheduleStatus = ui.scheduleTerm
				? ui.scheduleStatus[ui.scheduleTerm]?.[person.id]
				: undefined;
			const courses =
				person.id === 'you'
					? ownCourses
					: (ui.friendSchedules[ui.scheduleTerm ?? '']?.[person.id] ?? []);
			return {
				...person,
				days: Object.fromEntries(
					DAYS.slice(0, 5).map((day) => {
						const date = dates[day.order];
						const unavailable =
							person.sharing === 'Sharing unavailable' || hasExpired(person.expiry, ui.now);
						const status = unavailable
							? 'missing'
							: ui.termError ||
								  ui.busyStatus[range]?.[person.id] === 'error' ||
								  (person.sharing === 'Full schedule' && scheduleStatus === 'error')
								? 'error'
								: !response ||
									  (person.sharing === 'Full schedule' &&
											(!scheduleStatus || scheduleStatus === 'loading'))
									? 'loading'
									: 'ready';
						const blocks: ComparisonBlock[] = [];
						if (status === 'ready' && response) {
							const rawBusy = response.busy
								.filter((block) => block.date === date)
								.map((block) => ({
									start: timeMinutes(block.start)!,
									end: busyEndMinutes(block.end)!
								}));
							if (person.sharing === 'Full schedule' && scheduleStatus === 'loaded') {
								for (const course of courses)
									for (const meeting of course.meeting_times ?? []) {
										if (!meeting[day.key] || !meetsOn(meeting, date)) continue;
										const start = timeMinutes(meeting.begin_time)!;
										const end = busyEndMinutes(meeting.end_time)!;
										if (!rawBusy.some((block) => block.start <= start && block.end >= end))
											continue;
										blocks.push({
											id: String(meeting.id),
											start,
											end,
											title: meeting.title_overrides?.[day.key] ?? course.title,
											location: [
												meeting.location?.building?.name,
												...(meeting.location?.rooms ?? [])
											]
												.filter(Boolean)
												.join(' '),
											course,
											meeting
										});
									}
							}
							const represented = mergeBusy([
								...blocks,
								...savedCourses
									.filter((course) => {
										const time = course.meeting_times[0];
										const occurrence = saved.occurrences.find((item) => item.id === time.id);
										const meeting = saved.meetings.find(
											(item) => item.id === occurrence?.meeting_id
										);
										return (
											time.start_date === date &&
											meeting &&
											(person.id === 'you' ||
												[meeting.owner, ...meeting.friends].some((owner) => owner.id === person.id))
										);
									})
									.map((course) => ({
										start: timeMinutes(course.meeting_times[0].begin_time)!,
										end: busyEndMinutes(course.meeting_times[0].end_time)!
									}))
							]);
							for (const interval of mergeBusy(rawBusy)) {
								let cursor = interval.start;
								function add(start: number, end: number) {
									if (end > start) blocks.push({ id: `busy-${date}-${start}-${end}`, start, end });
								}
								for (const known of represented) {
									if (known.end <= cursor || known.start >= interval.end) continue;
									add(cursor, Math.min(known.start, interval.end));
									cursor = Math.max(cursor, known.end);
								}
								add(cursor, interval.end);
							}
						}
						return [
							date,
							{
								status,
								blocks,
								message:
									ui.termError ||
									ui.busyErrors[range]?.[person.id] ||
									ui.scheduleErrors[ui.scheduleTerm ?? '']?.[person.id]
							}
						];
					})
				)
			};
		});
}
