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

export function calendarDateTime(
	date: string,
	time: string,
	timeZone = 'America/New_York'
): string {
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
