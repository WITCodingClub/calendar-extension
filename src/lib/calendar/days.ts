import type { DayItem, Weekday } from '../types';

export const DAYS: DayItem[] = [
	{ key: 'monday', label: 'Monday', abbr: 'M', order: 0 },
	{ key: 'tuesday', label: 'Tuesday', abbr: 'T', order: 1 },
	{ key: 'wednesday', label: 'Wednesday', abbr: 'W', order: 2 },
	{ key: 'thursday', label: 'Thursday', abbr: 'Th', order: 3 },
	{ key: 'friday', label: 'Friday', abbr: 'F', order: 4 },
	{ key: 'saturday', label: 'Saturday', abbr: 'Sa', order: 5 },
	{ key: 'sunday', label: 'Sunday', abbr: 'Su', order: 6 }
];

export const WEEKDAYS: Weekday[] = DAYS.map((day) => day.key);

export function dayFlags(day: Weekday | undefined): Record<Weekday, boolean> {
	return Object.fromEntries(WEEKDAYS.map((key) => [key, key === day])) as Record<Weekday, boolean>;
}
