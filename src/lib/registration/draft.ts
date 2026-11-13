import type { PlanCourse } from './types';

export const DRAFT_KEY = 'registrationDraft';

export type TermDraft = { base: string | null; courses: PlanCourse[] };
export type Drafts = Record<string, TermDraft>;

function storage(): chrome.storage.StorageArea | undefined {
	try {
		return typeof chrome === 'undefined' ? undefined : chrome.storage?.local;
	} catch {
		return undefined;
	}
}

function course(value: unknown): value is PlanCourse {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	const fills = entry.fills as Record<string, unknown> | null;
	return (
		typeof entry.code === 'string' &&
		Array.isArray(entry.crns) &&
		entry.crns.every((crn) => typeof crn === 'string') &&
		(fills === null ||
			(!!fills &&
				typeof fills === 'object' &&
				typeof fills.kind === 'string' &&
				typeof fills.label === 'string'))
	);
}

function draft(value: unknown): value is TermDraft {
	if (!value || typeof value !== 'object') return false;
	const entry = value as Record<string, unknown>;
	return (
		(entry.base === null || typeof entry.base === 'string') &&
		Array.isArray(entry.courses) &&
		entry.courses.every(course)
	);
}

export async function readDrafts(): Promise<Drafts> {
	try {
		const area = storage();
		if (!area) return {};
		const stored = (await area.get(DRAFT_KEY))[DRAFT_KEY];
		if (!stored || typeof stored !== 'object') return {};
		return Object.fromEntries(
			Object.entries(stored as Record<string, unknown>).filter(
				(entry): entry is [string, TermDraft] => draft(entry[1])
			)
		);
	} catch (error) {
		console.error('Failed to read the registration draft', error);
		return {};
	}
}

export async function writeDrafts(drafts: Drafts): Promise<void> {
	try {
		const area = storage();
		if (!area) return;
		if (Object.keys(drafts).length) await area.set({ [DRAFT_KEY]: drafts });
		else await area.remove(DRAFT_KEY);
	} catch (error) {
		console.error('Failed to save the registration draft', error);
	}
}
