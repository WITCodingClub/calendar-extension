import { snackbar } from 'm3-svelte';
import { track } from './telemetry';

export async function copyIcsUrl(icsUrl: string | undefined): Promise<void> {
	if (!icsUrl) {
		console.error('No ICS URL available');
		return;
	}

	try {
		await navigator.clipboard.writeText(icsUrl);
		track('calendar_link_copied');
		snackbar('ICS URL copied to clipboard!', undefined, true);
	} catch (error) {
		console.error('Failed to copy ICS URL to clipboard:', error);
		snackbar('Failed to copy ICS URL to clipboard: ' + error, undefined, true);
	}
}
