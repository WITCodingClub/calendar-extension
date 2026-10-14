import { SvelteMap } from 'svelte/reactivity';
import { API } from '../api';
import { processedData } from '../stores';
import type { Course, GetPreferencesResponse, ResponseData } from '../types';
import { toDropdownColor } from './colors';
import { WEEKDAYS } from './days';

export function upsertProcessedTerm(
	termId: string,
	build: (existing: ResponseData | undefined) => ResponseData
): void {
	processedData.update((list) => {
		const i = list.findIndex((x) => String(x.termId) === termId);
		const next = [...list];
		const entry = { termId, responseData: build(list[i]?.responseData) };
		if (i >= 0) next[i] = entry;
		else next.push(entry);
		return next;
	});
}

export function mergeProcessedClasses(existing: Course[] | undefined, fresh: Course[]): Course[] {
	if (!existing?.length) return fresh;
	const overlayById = new Map(
		existing.flatMap((c) =>
			(c.meeting_times ?? [])
				.filter((mt) => mt?.id != null)
				.map(
					(mt) => [String(mt.id), { color: mt.color, title_overrides: mt.title_overrides }] as const
				)
		)
	);
	return fresh.map((c) => ({
		...c,
		meeting_times: c.meeting_times.map((mt) => {
			const overlay = overlayById.get(String(mt.id));
			return overlay
				? { ...mt, color: overlay.color, title_overrides: overlay.title_overrides }
				: mt;
		})
	}));
}

export function applyPreferences(term: string, map: Map<string, GetPreferencesResponse>): void {
	processedData.update((list) => {
		const i = list.findIndex((x) => String(x.termId) === term);
		if (i < 0) return list;
		const entry = list[i];
		const classes = entry.responseData.classes.map((c) => {
			const updatedMeetingTimes = (c.meeting_times ?? []).map((mt) => {
				if (!mt) return mt;
				const pref = map.get(String(mt.id));
				if (!pref) return mt;
				const color = pref.resolved?.color_id ? toDropdownColor(pref.resolved.color_id) : mt.color;
				let title_overrides = mt.title_overrides ?? {};
				const title = pref.preview?.title;
				if (title) {
					for (const k of WEEKDAYS) {
						if (mt[k]) {
							title_overrides = { ...title_overrides, [k]: title };
						}
					}
				}
				return { ...mt, color, title_overrides };
			});
			return { ...c, meeting_times: updatedMeetingTimes };
		});
		const next = [...list];
		next[i] = {
			termId: entry.termId,
			responseData: { ics_url: entry.responseData.ics_url, classes }
		};
		return next;
	});
}

const PREFERENCES_BATCH_SIZE = 200;

// Asks for the preferences of every meeting time in one request per 200 ids,
// instead of one request per meeting time. If the backend has no batch
// endpoint yet, it asks for each id on its own, as before.
export async function fetchPreferences(ids: Array<number | string>): Promise<{
	preferences: Map<number | string, GetPreferencesResponse>;
	version?: string;
}> {
	const map = new SvelteMap<number | string, GetPreferencesResponse>();
	const chunks: Array<Array<number | string>> = [];
	for (let i = 0; i < ids.length; i += PREFERENCES_BATCH_SIZE) {
		chunks.push(ids.slice(i, i + PREFERENCES_BATCH_SIZE));
	}

	const versions = await Promise.all(
		chunks.map(async (chunk) => {
			const batch = await API.getMeetingTimePreferences(chunk);
			if (batch) {
				for (const id of chunk) {
					const data = batch.preferences[String(id)];
					if (data) map.set(id, data);
				}
				return batch.version;
			}

			await Promise.all(
				chunk.map(async (id) => {
					try {
						const data: GetPreferencesResponse = await API.getMeetingTimePreference(id);
						if (data) map.set(id, data);
					} catch {
						// Skip this meeting time, as the page did before.
					}
				})
			);
		})
	);

	const version = versions[0];
	return {
		preferences: map,
		version: versions.every((value) => value === version) ? version : undefined
	};
}
