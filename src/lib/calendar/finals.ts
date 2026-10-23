import type { Course, FinalExam } from '../types';
import { DAYS } from './days';
import { syntheticCourse } from './layout';

export function finalExamCourses(finals: FinalExam[], dates: string[]): Course[] {
	return finals
		.filter((exam) => dates.includes(exam.date))
		.map((exam) => {
			const day = DAYS[dates.indexOf(exam.date)].key;
			return syntheticCourse(`Final exam: ${exam.course}`, {
				id: `final:${exam.id}`,
				begin_time: exam.start_time,
				end_time: exam.end_time,
				start_date: exam.date,
				end_date: exam.date,
				monday: day === 'monday',
				tuesday: day === 'tuesday',
				wednesday: day === 'wednesday',
				thursday: day === 'thursday',
				friday: day === 'friday',
				saturday: false,
				sunday: false,
				location: { building: null, rooms: [exam.location_name || exam.location || ''] }
			});
		});
}
