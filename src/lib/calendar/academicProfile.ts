import { createWitTab } from '../browser/tabs';

export const STUDENT_PROFILE_URL =
	'https://selfservice.wit.edu/StudentSelfService/studentProfile/studentProfile#';

export class StudentPageAuthError extends Error {
	constructor(readonly url: string) {
		super('Please sign in to LeopardWeb and try syncing your academic data again.');
		this.name = 'StudentPageAuthError';
	}
}

export async function openStudentSignIn(url: string): Promise<chrome.tabs.Tab | undefined> {
	const [tab] = await chrome.tabs.query({ url: url.split('#')[0], currentWindow: true });
	return tab?.id != null
		? chrome.tabs.update(tab.id, { url, active: true })
		: createWitTab(url, true);
}

export type AcademicProfile = {
	source: 'leopardweb' | 'student';
	level: string | null;
	class_standing: string | null;
	admit_type: string | null;
	admit_term: string | null;
	programs: AcademicProgram[];
};

export type AcademicProgram = {
	role: 'major' | 'minor' | 'concentration' | 'certificate';
	code: string | null;
	name: string;
	degree: string | null;
	college: string | null;
	department: string | null;
	concentration: string | null;
	study_path: string | null;
	catalog_term: string | null;
};

export type StoredAcademicProfile = Omit<AcademicProfile, 'source' | 'programs'> & {
	programs: (AcademicProgram & { matched: boolean | null })[];
};

export async function lookupAcademicProfile(): Promise<
	{ profile: AcademicProfile } | { error: string }
> {
	const read = (): AcademicProfile | undefined => {
		const roots = Array.from(
			document.querySelectorAll('#primary-curriculum-details, #secondary-curriculum-details')
		);
		if (!roots.some((root) => root.id === 'primary-curriculum-details')) return;
		const programs: AcademicProgram[] = [];
		let primary: Map<string, string | null> | undefined;
		for (const root of roots) {
			const fields = new Map<string, string | null>();
			const entries: Pick<AcademicProgram, 'role' | 'name' | 'department' | 'concentration'>[] = [];
			let current: (typeof entries)[number] | undefined;
			const allowed = new Set([
				'degree',
				'study path',
				'level',
				'program',
				'college',
				'major',
				'department',
				'concentration',
				'minor',
				'admit type',
				'admit term',
				'catalog term',
				'class standing',
				'classification',
				'certificate'
			]);
			for (const row of Array.from(root.querySelectorAll('.row'))) {
				const label = row.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim();
				const span = row.querySelector('span');
				if (!label || !span) continue;
				const key = label.replace(/:$/, '').trim().toLowerCase();
				if (!allowed.has(key)) continue;
				const text = span.textContent?.replace(/\s+/g, ' ').trim() ?? '';
				const value = !text || /^not provided$/i.test(text) ? null : text;
				if (key === 'major' || key === 'minor' || key === 'certificate') {
					current = value
						? { role: key, name: value, department: null, concentration: null }
						: undefined;
					if (current) entries.push(current);
				} else if (key === 'department' && current) current.department = value;
				else if (key === 'concentration' && current) current.concentration = value;
				fields.set(key, value);
			}
			if (
				root.id === 'secondary-curriculum-details' &&
				!Array.from(fields.values()).some((value) => value !== null)
			)
				continue;
			const field = (name: string) => fields.get(name) ?? null;
			if (root.id === 'primary-curriculum-details') primary = fields;
			if (!entries.length) return;
			let firstMajor = true;
			for (const entry of entries) {
				const major = entry.role === 'major';
				programs.push({
					...entry,
					code:
						major && firstMajor ? (field('program')?.match(/\(([^()]+)\)\s*$/)?.[1] ?? null) : null,
					degree: major ? field('degree') : null,
					college: major ? field('college') : null,
					study_path: major ? field('study path') : null,
					catalog_term: field('catalog term')
				});
				if (major) firstMajor = false;
			}
		}
		if (!primary || !programs.length) return;
		return {
			source: 'leopardweb',
			level: primary.get('level') ?? null,
			class_standing: primary.get('class standing') ?? primary.get('classification') ?? null,
			admit_type: primary.get('admit type') ?? null,
			admit_term: primary.get('admit term') ?? null,
			programs
		};
	};
	const immediate = read();
	if (immediate) return { profile: immediate };
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			const profile = read();
			if (!profile) return;
			clearTimeout(timeout);
			observer.disconnect();
			resolve({ profile });
		});
		const timeout = setTimeout(() => {
			observer.disconnect();
			resolve({
				error: document.querySelector('#primary-curriculum-details')
					? 'The student profile page loaded, but no academic programs could be read from its curriculum details. Please retry after the curriculum is visible.'
					: 'The student profile page loaded, but its primary curriculum details were not found. Please check that the Student Profile page is open and try again.'
			});
		}, 15_000);
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			characterData: true
		});
	});
}

export async function fetchAcademicProfile(
	active: () => boolean = () => true
): Promise<AcademicProfile | undefined> {
	return (
		await readStudentPage<{ profile: AcademicProfile }>(
			STUDENT_PROFILE_URL,
			lookupAcademicProfile,
			active
		)
	)?.profile;
}

export async function readStudentPage<T extends object>(
	url: string,
	lookup: () => Promise<T | { error: string; loginRequired?: boolean }>,
	active: () => boolean
): Promise<T | undefined> {
	return withStudentPage(
		url,
		async (tabId) => {
			const results = await chrome.scripting.executeScript({
				target: { tabId },
				world: 'MAIN',
				func: lookup
			});
			if (!active()) return;
			const result = results[0]?.result;
			if (result && 'error' in result && result.loginRequired) throw new StudentPageAuthError(url);
			if (!result || 'error' in result)
				throw new Error(result?.error || 'LeopardWeb did not return academic data. Try again.');
			return result;
		},
		active
	);
}

export async function withStudentPage<T>(
	url: string,
	work: (tabId: number) => Promise<T>,
	active: () => boolean
): Promise<T | undefined> {
	if (!active()) return;
	const isProfile = (candidate?: string) => candidate?.split('#')[0] === url.split('#')[0];
	const tabs = await chrome.tabs.query({ url: url.split('#')[0] });
	if (!active()) return;
	const current = tabs.find((tab) => isProfile(tab.url));
	const owned = !current;
	const tab = owned ? await createWitTab(url, false) : current;
	if (tab?.id == null) throw new Error('Could not open the LeopardWeb student profile. Try again.');
	const tabId = tab.id;
	try {
		if (!active()) return;
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timeout);
				chrome.tabs.onUpdated.removeListener(updated);
				chrome.tabs.onRemoved.removeListener(removed);
			};
			const updated = (id: number, change: { status?: string }) => {
				if (id === tabId && change.status === 'complete') {
					cleanup();
					resolve();
				}
			};
			const removed = (id: number) => {
				if (id === tabId) {
					cleanup();
					reject(new Error('The LeopardWeb student profile was closed. Try again.'));
				}
			};
			const timeout = setTimeout(() => {
				cleanup();
				reject(new Error('The LeopardWeb student profile did not finish loading. Try again.'));
			}, 30_000);
			chrome.tabs.onUpdated.addListener(updated);
			chrome.tabs.onRemoved.addListener(removed);
			void chrome.tabs.get(tabId).then(
				(loaded) => {
					if (loaded.status === 'complete') {
						cleanup();
						resolve();
					}
				},
				(error) => {
					cleanup();
					reject(error);
				}
			);
		});
		if (!active()) return;
		const loaded = await chrome.tabs.get(tabId);
		if (!active()) return;
		if (!isProfile(loaded.url)) {
			throw new StudentPageAuthError(url);
		}
		const result = await work(tabId);
		return active() ? result : undefined;
	} finally {
		if (owned) await chrome.tabs.remove(tabId).catch(() => undefined);
	}
}
