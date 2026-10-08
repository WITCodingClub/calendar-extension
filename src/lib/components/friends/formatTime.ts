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
