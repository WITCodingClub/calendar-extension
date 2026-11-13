import { formatTime } from '../datetime';
import type {
	CatalogSection,
	RelaxPreference,
	ScheduleCount,
	ScheduleOptionsRequest,
	SchedulePreferences,
	TimeRange
} from './types';

export type Step = 'courses' | 'days' | 'hours' | 'off' | 'breaks' | 'seats';
export const STEPS: Step[] = ['courses', 'days', 'hours', 'off', 'breaks', 'seats'];

export type OffMode = 'none' | 'any' | 'pick';

export const EARLIEST = 480;
export const LATEST = 1320;
export const MAX_CODES_PER_COURSE = 5;
export const MAX_CODES = 20;
export const MAX_COURSES = 10;

export const DAY_ORDER = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday'
];

export const DAY_SHORT: Record<string, string> = {
	monday: 'Mon',
	tuesday: 'Tue',
	wednesday: 'Wed',
	thursday: 'Thu',
	friday: 'Fri',
	saturday: 'Sat',
	sunday: 'Sun'
};

export const DAY_LONG: Record<string, string> = {
	monday: 'Monday',
	tuesday: 'Tuesday',
	wednesday: 'Wednesday',
	thursday: 'Thursday',
	friday: 'Friday'
};

export const BANDS = [
	{ id: 'morning', label: 'Morning', range: 'Before 10', from: 0, to: 600 },
	{ id: 'midday', label: 'Midday', range: '10 to 1', from: 600, to: 780 },
	{ id: 'afternoon', label: 'Afternoon', range: '1 to 5', from: 780, to: 1020 },
	{ id: 'evening', label: 'Evening', range: 'After 5', from: 1020, to: 1440 }
];

export type Prefs = {
	cells: Record<string, 'no' | 'avoid'>;
	anyDayOff: boolean;
	offDays: string[];
	earliest: number;
	latest: number;
	openOnly: boolean;
	days: 'fewer' | 'spread' | 'any';
	breaks: 'tight' | 'lunch' | 'any';
};

export type Answers = { prefs: Prefs; offMode: OffMode; offDays: string[] };

export type ScheduleItem = { codes: string[]; crns?: string[] };

export function defaultPrefs(): Prefs {
	return {
		cells: {},
		anyDayOff: false,
		offDays: [],
		earliest: EARLIEST,
		latest: LATEST,
		openOnly: true,
		days: 'any',
		breaks: 'any'
	};
}

export function minutes(time: string) {
	const [hours, mins] = time.split(':').map(Number);
	return hours * 60 + mins;
}

export function clock(value: number) {
	return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function effectivePrefs({ prefs, offMode, offDays }: Answers): Prefs {
	return {
		...prefs,
		anyDayOff: offMode === 'any',
		offDays: offMode === 'pick' ? DAY_ORDER.filter((day) => offDays.includes(day)) : []
	};
}

function ranges(cells: Prefs['cells'], value: 'no' | 'avoid'): TimeRange[] {
	return BANDS.flatMap((band) => {
		const days = DAY_ORDER.filter((day) => cells[`${day}:${band.id}`] === value);
		if (!days.length) return [];
		return [
			{
				days,
				...(band.from > 0 ? { after: clock(band.from) } : {}),
				...(band.to < 1440 ? { before: clock(band.to) } : {})
			}
		];
	});
}

export function toPreferences(prefs: Prefs): SchedulePreferences {
	const preferences: SchedulePreferences = {};
	const blocked = ranges(prefs.cells, 'no');
	const avoid = ranges(prefs.cells, 'avoid');
	if (blocked.length) preferences.blocked = blocked;
	if (avoid.length) preferences.avoid = avoid;
	if (prefs.earliest > EARLIEST) preferences.earliest = clock(prefs.earliest);
	if (prefs.latest < LATEST) preferences.latest = clock(prefs.latest);
	if (prefs.anyDayOff) preferences.day_off = 'any';
	else if (prefs.offDays.length) preferences.day_off = [...prefs.offDays];
	if (prefs.openOnly) preferences.open_only = true;
	if (prefs.days !== 'any') preferences.days = prefs.days;
	if (prefs.breaks !== 'any') preferences.breaks = prefs.breaks;
	return preferences;
}

function trimCodes(items: ScheduleItem[]): ScheduleItem[] {
	const trimmed = items.map((item) => ({
		...item,
		codes: item.codes.slice(0, MAX_CODES_PER_COURSE)
	}));
	let total = trimmed.reduce((sum, item) => sum + item.codes.length, 0);
	while (total > MAX_CODES) {
		const longest = trimmed.reduce((best, item) =>
			item.codes.length > best.codes.length ? item : best
		);
		if (longest.codes.length <= 1) break;
		longest.codes = longest.codes.slice(0, -1);
		total -= 1;
	}
	return trimmed;
}

export function toScheduleRequest(
	termUid: string | number,
	items: ScheduleItem[],
	prefs: Prefs,
	limit?: number
): ScheduleOptionsRequest {
	const seen = new Set<string>();
	const unique = items.filter((item) => {
		const key = [...item.codes].sort().join('|');
		if (!item.codes.length || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	const courses = trimCodes(unique.slice(0, MAX_COURSES)).map((item) =>
		item.crns?.length ? { codes: item.codes, crns: item.crns } : { codes: item.codes }
	);
	return {
		term_uid: Number(termUid),
		courses,
		preferences: toPreferences(prefs),
		...(limit === undefined ? {} : { limit })
	};
}

export function relaxAnswers(preference: RelaxPreference | string, answers: Answers): Answers {
	const { prefs } = answers;
	switch (preference) {
		case 'open_only':
			return { ...answers, prefs: { ...prefs, openOnly: false } };
		case 'earliest':
			return { ...answers, prefs: { ...prefs, earliest: EARLIEST } };
		case 'latest':
			return { ...answers, prefs: { ...prefs, latest: LATEST } };
		case 'day_off':
			return { prefs: { ...prefs, anyDayOff: false, offDays: [] }, offMode: 'none', offDays: [] };
		case 'blocked':
			return {
				...answers,
				prefs: {
					...prefs,
					cells: Object.fromEntries(
						Object.entries(prefs.cells).filter(([, value]) => value !== 'no')
					)
				}
			};
		default:
			return answers;
	}
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
	return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function inRange(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1440;
}

export function answersFrom(value: unknown): Answers | null {
	if (!value || typeof value !== 'object') return null;
	const { prefs, offMode, offDays } = value as Record<string, unknown>;
	if (!prefs || typeof prefs !== 'object' || !oneOf(offMode, ['none', 'any', 'pick'] as const))
		return null;
	const saved = prefs as Record<string, unknown>;
	const days = Array.isArray(offDays) ? offDays.filter((day) => oneOf(day, DAY_ORDER)) : [];
	const cells = Object.fromEntries(
		Object.entries(
			saved.cells && typeof saved.cells === 'object' ? (saved.cells as Record<string, unknown>) : {}
		).filter((entry): entry is [string, 'no' | 'avoid'] =>
			oneOf(entry[1], ['no', 'avoid'] as const)
		)
	);
	const base = defaultPrefs();
	return {
		prefs: {
			cells,
			anyDayOff: false,
			offDays: [],
			earliest: inRange(saved.earliest) ? saved.earliest : base.earliest,
			latest: inRange(saved.latest) ? saved.latest : base.latest,
			openOnly: typeof saved.openOnly === 'boolean' ? saved.openOnly : base.openOnly,
			days: oneOf(saved.days, ['fewer', 'spread', 'any'] as const) ? saved.days : base.days,
			breaks: oneOf(saved.breaks, ['tight', 'lunch', 'any'] as const) ? saved.breaks : base.breaks
		},
		offMode,
		offDays: days
	};
}

export function countLabel(count: ScheduleCount) {
	return count.capped ? `${count.count}+` : String(count.count);
}

export function meetingSummary(section: Pick<CatalogSection, 'meeting_times'>, military = false) {
	const groups = new Map<string, string[]>();
	for (const meeting of section.meeting_times) {
		const key = `${formatTime(meeting.begin_time, military)} – ${formatTime(meeting.end_time, military)}`;
		groups.set(key, [...(groups.get(key) ?? []), DAY_SHORT[meeting.day] ?? meeting.day]);
	}
	return [...groups].map(([time, days]) => `${days.join('/')} ${time}`).join(', ');
}

export function seatSummary(section: Pick<CatalogSection, 'seats' | 'waitlist'>) {
	const { available, capacity } = section.seats;
	if (available === null || capacity === null) return 'Seats unknown';
	if (available > 0) return `${available} of ${capacity} seats open`;
	if (section.waitlist.capacity) return `Full · ${section.waitlist.available ?? 0} waitlist spots`;
	return 'Full';
}
