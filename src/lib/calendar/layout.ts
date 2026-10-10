import type { Course, MeetingTime } from '../types';
import { textColor } from './colors';
import { DAYS } from './days';

export type CalendarGridEvent = {
	course: Course;
	meeting: MeetingTime;
	startOffset: number;
	width: number;
	bgColor: string;
	textColor: string;
	stackIndex: number;
	overlapCount: number;
	preview?: boolean;
	ownerId?: string;
	ownerLabel?: string;
};

type PositionedMeeting = CalendarGridEvent & { startTotal: number; endTotal: number };

export function syntheticCourse(title: string, meeting: MeetingTime): Course {
	return {
		title,
		prefix: '',
		course_number: 0,
		schedule_type: '',
		term: { uid: 0, season: '', year: 0 },
		professor: { first_name: '', last_name: '', email: '' },
		meeting_times: [meeting]
	};
}

export function calendarStartHour(courses: Course[]): number {
	return Math.min(
		8,
		...courses.flatMap((course) =>
			course.meeting_times.map((meeting) => Number(meeting.begin_time.split(':')[0]))
		)
	);
}

export function latestEndHour(courses: Course[]): number {
	let latestHour = 8;

	for (const course of courses) {
		for (const meeting of course.meeting_times ?? []) {
			if (!meeting?.end_time) continue;
			const endHour = parseInt(meeting.end_time.split(':')[0]);
			const endMin = parseInt(meeting.end_time.split(':')[1]);
			const roundedHour = endMin > 0 ? endHour + 1 : endHour;

			if (roundedHour > latestHour) {
				latestHour = roundedHour;
			}
		}
	}

	return latestHour;
}

export function stackMeetings(
	courses: Course[],
	options: {
		dates: string[];
		startHour: number;
		historic: boolean;
		labColor: string;
		lectureColor: string;
	}
): { byDay: Record<string, PositionedMeeting[]> } {
	const { dates, startHour, historic, labColor, lectureColor } = options;
	const byDay: Record<string, PositionedMeeting[]> = {};
	for (const { key } of DAYS) {
		byDay[key] = [];
	}
	for (const course of courses) {
		if (!course) continue;
		const isLab = (course.schedule_type ?? '').toLowerCase() === 'laboratory';
		const bgColorBase = isLab ? labColor : lectureColor;
		for (const meeting of course.meeting_times ?? []) {
			if (!meeting) continue;
			for (const { key, order } of DAYS) {
				if (!meeting[key as keyof MeetingTime]) continue;
				const date = dates[order];
				if (
					!historic &&
					date &&
					((meeting.start_date && date < meeting.start_date.slice(0, 10)) ||
						(meeting.end_date && date > meeting.end_date.slice(0, 10)))
				)
					continue;
				const startHourValue = parseInt(meeting.begin_time.split(':')[0]);
				const startMin = parseInt(meeting.begin_time.split(':')[1]);
				const endHour = parseInt(meeting.end_time.split(':')[0]);
				const endMin = parseInt(meeting.end_time.split(':')[1]);
				const startTotal = startHourValue * 60 + startMin;
				const endTotal = endHour * 60 + endMin;
				const startOffset = (((startHourValue - startHour) * 60 + startMin) / 60) * 8;
				const width = ((endTotal - startTotal) / 60) * 8;
				const bgColor = meeting.color ?? bgColorBase;
				byDay[key].push({
					course,
					meeting,
					startOffset,
					width,
					startTotal,
					endTotal,
					bgColor,
					textColor: textColor(bgColor),
					stackIndex: 0,
					overlapCount: 1
				});
			}
		}
	}
	for (const { key } of DAYS) {
		const arr = byDay[key];
		arr.sort((a, b) =>
			a.startTotal === b.startTotal ? a.endTotal - b.endTotal : a.startTotal - b.startTotal
		);
		const stackEnds: number[] = [];
		const active: PositionedMeeting[] = [];
		for (const item of arr) {
			for (let i = active.length - 1; i >= 0; i--) {
				if (item.startTotal >= active[i].endTotal) {
					active.splice(i, 1);
				}
			}
			const currentOverlap = active.length + 1;
			for (const a of active) {
				a.overlapCount = Math.max(a.overlapCount, currentOverlap);
			}
			item.overlapCount = currentOverlap;
			let stack = stackEnds.findIndex((end) => item.startTotal >= end);
			if (stack === -1) {
				stack = stackEnds.length;
				stackEnds.push(item.endTotal);
			} else {
				stackEnds[stack] = item.endTotal;
			}
			item.stackIndex = stack;
			active.push(item);
		}
	}
	return { byDay };
}

export function earliestOffset(stacked: { byDay: Record<string, CalendarGridEvent[]> }): number {
	let min = Infinity;
	for (const { key } of DAYS.slice(0, 5)) {
		for (const item of stacked.byDay?.[key] ?? []) {
			if (item.startOffset < min) min = item.startOffset;
		}
	}
	return Number.isFinite(min) ? min : 0;
}

export function positionEvents(events: CalendarGridEvent[]) {
	const sorted = events.toSorted((a, b) => a.startOffset - b.startOffset);
	let cluster: CalendarGridEvent[] = [];
	let clusterEnd = -Infinity;
	let laneEnds: number[] = [];
	function finishCluster() {
		for (const item of cluster) item.overlapCount = laneEnds.length;
	}
	for (const item of sorted) {
		if (item.startOffset >= clusterEnd) {
			finishCluster();
			cluster = [];
			laneEnds = [];
		}
		let lane = laneEnds.findIndex((end) => end <= item.startOffset);
		if (lane < 0) lane = laneEnds.length;
		laneEnds[lane] = item.startOffset + item.width;
		item.stackIndex = lane;
		cluster.push(item);
		clusterEnd = Math.max(...laneEnds);
	}
	finishCluster();
	return sorted;
}
