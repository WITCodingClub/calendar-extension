import { writable } from 'svelte/store';
import type { Course, ResponseData, UserSettings } from './types';
import { browser } from '$app/environment';

type ProcessedTerm = { termId: string; responseData: ResponseData };

function storedArray(key: string) {
	if (!browser) return [];
	const raw = localStorage.getItem(key);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export const processedData = writable<ProcessedTerm[]>(storedArray('processedData'));
export const enrolledTerms = writable<Array<{ id: string; name: string }>>(
	storedArray('enrolledTerms')
);
export const userSettings = writable<UserSettings | undefined>(undefined);
export const icsUrl = writable<string | undefined>(undefined);

export function termClasses(list: ProcessedTerm[], term: string | undefined): Course[] | undefined {
	return list.find((item) => String(item.termId) === term)?.responseData.classes;
}

export function resetStores(): void {
	userSettings.set(undefined);
	processedData.set([]);
	enrolledTerms.set([]);
	icsUrl.set(undefined);
}

function migrateIcsUrl(url: string): string {
	return url.replace('server.calendar.witcc.dev', 'calendar.witcc.dev');
}

if (browser) {
	const storedUserSettings = localStorage.getItem('userSettings');
	if (storedUserSettings) {
		userSettings.set(JSON.parse(storedUserSettings));
	}
	const storedIcsUrl = localStorage.getItem('icsUrl');
	if (storedIcsUrl) {
		const migratedUrl = migrateIcsUrl(storedIcsUrl);
		if (migratedUrl !== storedIcsUrl) {
			localStorage.setItem('icsUrl', migratedUrl);
		}
		icsUrl.set(migratedUrl);
	}
}

processedData.subscribe((value) => {
	if (browser) {
		localStorage.setItem('processedData', JSON.stringify(value));
	}
});

enrolledTerms.subscribe((value) => {
	if (browser) {
		localStorage.setItem('enrolledTerms', JSON.stringify(value));
	}
});

userSettings.subscribe((value) => {
	if (browser) {
		if (value === undefined) {
			localStorage.removeItem('userSettings');
			return;
		}
		localStorage.setItem('userSettings', JSON.stringify(value));
	}
});

icsUrl.subscribe((value) => {
	if (browser) {
		localStorage.setItem('icsUrl', value ?? '');
	}
});
