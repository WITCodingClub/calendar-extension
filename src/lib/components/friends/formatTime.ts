export function formatTime(time: string, militaryTime: boolean): string {
	if (militaryTime) return time;
	const [hours, minutes] = time.split(':').map(Number);
	return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}
