export function todayDate(): string {
	const date = new Date();
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
