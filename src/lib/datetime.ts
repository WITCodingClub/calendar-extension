export const CAMPUS_TIME_ZONE = 'America/New_York';

export function todayDate(timeZone?: string): string {
	const date = new Date();
	if (timeZone) {
		const parts = Object.fromEntries(
			new Intl.DateTimeFormat('en-US', {
				timeZone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			})
				.formatToParts(date)
				.map((part) => [part.type, part.value])
		);
		return `${parts.year}-${parts.month}-${parts.day}`;
	}
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function weekDates(value = todayDate()): string[] {
	let monday = new Date(`${value}T00:00:00Z`);
	if (!Number.isFinite(monday.getTime())) monday = new Date(`${todayDate()}T00:00:00Z`);
	monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
	return Array.from({ length: 5 }, (_, index) =>
		shiftDate(monday.toISOString().slice(0, 10), index)
	);
}

export function schoolDays(value = todayDate()): string[] {
	const days: string[] = [];
	for (let date = value; days.length < 5; date = shiftDate(date, 1)) {
		const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
		if (weekday !== 0 && weekday !== 6) days.push(date);
	}
	return days;
}

export function dateLabel(date: string): string {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

export function calendarDateTime(date: string, time: string, timeZone = CAMPUS_TIME_ZONE): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
		throw new Error('Choose a valid date and time.');
	const target = Date.parse(`${date}T${time}:00Z`);
	if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date)
		throw new Error('Choose a valid date.');
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	});
	function wallClock(instant: number) {
		const parts = Object.fromEntries(
			formatter.formatToParts(instant).map((part) => [part.type, part.value])
		);
		return Date.parse(
			`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`
		);
	}
	let instant = target;
	for (let i = 0; i < 3; i++) instant += target - wallClock(instant);
	if (wallClock(instant) !== target)
		throw new Error('This time does not exist in the calendar timezone.');
	return new Date(instant).toISOString();
}

export function endOfCampusDay(date: string): string {
	return new Date(Date.parse(calendarDateTime(shiftDate(date, 1), '00:00')) - 1).toISOString();
}

export function campusDate(value: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: CAMPUS_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date(value));
}

export function formatCampusDate(value: string): string {
	return new Date(value).toLocaleDateString(undefined, { timeZone: CAMPUS_TIME_ZONE });
}

export function hasExpired(expiresAt: string | null | undefined, now: number): boolean {
	return !!expiresAt && Date.parse(expiresAt) <= Math.max(now, Date.now());
}

export function timeMinutes(value: string): number | undefined {
	const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
	if (!match) return undefined;
	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (minutes > 59 || hours > 23) return undefined;
	if (match[3]) {
		if (hours < 1 || hours > 12) return undefined;
		hours = (hours % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
	}
	return hours * 60 + minutes;
}

export function minutesTime(minutes: number): string {
	return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatTime(time: string, militaryTime: boolean): string {
	if (militaryTime) return time;
	const [hours, minutes] = time.split(':').map(Number);
	return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours % 24 >= 12 ? 'PM' : 'AM'}`;
}

export function normalizeTime(value: string, militaryTime: boolean): string {
	const minutes = timeMinutes(value);
	return minutes === undefined ? value : formatTime(minutesTime(minutes), militaryTime);
}
