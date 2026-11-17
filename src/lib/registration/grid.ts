import { stackMeetings } from '../calendar/layout';
import type { ComparisonGridEvent } from '../friends/comparison';
import type { Course, MeetingTime } from '../types';
import { minutes } from './builder';
import { codeOf, isLab } from './options';
import type { CatalogSection } from './types';

export const LECTURE_COLOR = '#039BE5';
export const LAB_COLOR = '#F6BF26';

export function toCourse(section: CatalogSection, term: string): Course {
	const groups = new Map<string, CatalogSection['meeting_times']>();
	for (const meeting of section.meeting_times) {
		const key = `${meeting.begin_time}-${meeting.end_time}`;
		groups.set(key, [...(groups.get(key) ?? []), meeting]);
	}
	const lab = isLab(section);
	const code = codeOf(section);
	return {
		title: lab ? `${code} Lab` : code,
		prefix: section.subject_code,
		course_number: section.course_number,
		schedule_type: lab ? 'Laboratory' : section.schedule_type,
		term: { uid: Number(term), season: '', year: 0 },
		professor: { first_name: section.instructors[0]?.name ?? '', last_name: '', email: '' },
		meeting_times: [...groups.values()].map((list, index): MeetingTime => {
			const [building, ...room] = (list[0].location?.display ?? '').split(' ');
			return {
				id: `pick:${section.crn}:${index}`,
				begin_time: list[0].begin_time,
				end_time: list[0].end_time,
				start_date: null,
				end_date: null,
				monday: list.some((m) => m.day === 'monday'),
				tuesday: list.some((m) => m.day === 'tuesday'),
				wednesday: list.some((m) => m.day === 'wednesday'),
				thursday: list.some((m) => m.day === 'thursday'),
				friday: list.some((m) => m.day === 'friday'),
				saturday: false,
				sunday: false,
				location: {
					building: building ? { name: building, abbreviation: building } : null,
					rooms: room.length ? [room.join(' ')] : []
				}
			};
		})
	};
}

export function crnOf(item: Pick<ComparisonGridEvent, 'meeting'>) {
	return String(item.meeting.id).split(':')[1];
}

export function sectionGrid(term: string, sections: CatalogSection[]) {
	const courses = sections.map((section) => toCourse(section, term));
	const stacked = stackMeetings(courses, {
		dates: [],
		startHour: 8,
		historic: true,
		labColor: LAB_COLOR,
		lectureColor: LECTURE_COLOR
	});
	const byDay: Record<string, ComparisonGridEvent[]> = stacked.byDay;
	const latest = Math.max(
		17,
		...courses.flatMap((course) =>
			course.meeting_times.map((meeting) => Math.ceil(minutes(meeting.end_time) / 60))
		)
	);
	return { stacked: { byDay }, latest };
}
