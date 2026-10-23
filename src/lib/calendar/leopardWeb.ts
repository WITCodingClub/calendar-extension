import { API } from '../api';
import { createWitTab } from '../browser/tabs';
import type { PanelSession } from '../panel/session';
import { enrolledTerms } from '../stores';
import type { ProcessingTerm } from '../types';
import { getCourseSync } from '../panel/courseSync';
import { StudentPageAuthError, withStudentPage } from './academicProfile';

export const REGISTRATION_HISTORY_URL =
	'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

export type ImportedTerms = { tabId: number; terms: TermOption[]; usedTermId: string };

type TermOption = { id: string; name: string };
type Registration = { courseReferenceNumber: string; term: string; courseNumber: string };
type RegistrationsLookupResult =
	| { error: string; loginRequired?: boolean }
	| { termOptions: TermOption[]; registrations: Registration[]; usedTermId: string };
type TermCoursesLookupResult =
	| { error: string; loginRequired?: boolean }
	| { courses: ProcessingTerm['courses'] };

async function lookupRegistrations(
	termIdArg: string,
	allowFallback = true
): Promise<RegistrationsLookupResult> {
	try {
		// Extract the student's enrolled terms from the page dropdown
		const select = document.querySelector<HTMLSelectElement>('#lookupFilter');
		const termOptions = select
			? Array.from(select.options).map((o) => ({ id: o.value, name: o.text.trim() }))
			: [];

		// If the requested term isn't in the enrolled list, fall back to the first enrolled term
		let actualTermId = termIdArg;
		if (termOptions.length > 0 && !termOptions.some((t) => t.id === actualTermId)) {
			if (!allowFallback) throw new Error('The selected term is not available in LeopardWeb.');
			actualTermId = termOptions[0].id;
		}

		// Get CSRF token for the request
		const token =
			document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content') ?? '';

		// Fetch registrations for the (possibly corrected) term
		const r = await fetch(
			`https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/reset?term=${actualTermId}`,
			{
				credentials: 'include',
				signal: AbortSignal.timeout(30_000),
				headers: {
					Accept: 'application/json, text/javascript, */*; q=0.01',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			}
		);
		if (
			r.status === 401 ||
			r.status === 403 ||
			r.redirected ||
			!r.headers.get('content-type')?.includes('application/json')
		)
			return { error: 'Please sign in to LeopardWeb and select Retry.', loginRequired: true };
		if (!r.ok) throw new Error(`LeopardWeb returned ${r.status}`);
		const data = await r.json();

		return {
			termOptions,
			registrations: data?.data?.registrations ?? [],
			usedTermId: actualTermId
		};
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

async function lookupTermCourses(term: string): Promise<TermCoursesLookupResult> {
	try {
		const token = document.querySelector('meta[name="synchronizerToken"]')?.getAttribute('content');
		const response = await fetch(
			`/StudentRegistrationSsb/ssb/registrationHistory/reset?term=${encodeURIComponent(term)}`,
			{
				credentials: 'include',
				signal: AbortSignal.timeout(30_000),
				headers: {
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			}
		);
		if (
			response.status === 401 ||
			response.status === 403 ||
			response.redirected ||
			!response.headers.get('content-type')?.includes('application/json')
		)
			return { error: 'Please sign in to LeopardWeb and select Retry.', loginRequired: true };
		if (!response.ok) throw new Error(`LeopardWeb returned ${response.status}`);
		const data = await response.json();
		if (!Array.isArray(data?.data?.registrations))
			throw new Error('Unexpected response from LeopardWeb');
		return {
			courses: data.data.registrations.map(
				(reg: { courseReferenceNumber: string; term: string; courseNumber: string }) => ({
					crn: reg.courseReferenceNumber,
					term: reg.term,
					courseNumber: reg.courseNumber
				})
			)
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

function registrationCourses(registrations: Registration[]): ProcessingTerm['courses'] {
	return registrations.map((reg) => ({
		crn: reg.courseReferenceNumber,
		term: reg.term,
		courseNumber: reg.courseNumber
	}));
}

async function openRegistrationTab(): Promise<chrome.tabs.Tab> {
	const tab = await createWitTab(REGISTRATION_HISTORY_URL);
	const openedTabId = tab.id;
	if (!openedTabId) return tab;

	await new Promise<void>((resolve) => {
		const listener = (tabId: number, changeInfo: { status?: string }) => {
			if (tabId === openedTabId && changeInfo.status === 'complete') {
				chrome.tabs.onUpdated.removeListener(listener);
				resolve();
			}
		};
		chrome.tabs.onUpdated.addListener(listener);
	});

	await new Promise((resolve) => setTimeout(resolve, 1000));
	return tab;
}

function saveEnrolledTerms(termOptions: TermOption[]): void {
	if (termOptions.length > 0) {
		enrolledTerms.set(termOptions);
		API.userSettings({ enrolled_terms: termOptions }).catch(() => {});
	}
}

export function backfillPastTerms(session: PanelSession, imported?: ImportedTerms) {
	return session.backfills.run(
		'past_terms',
		async () => {
			const process = async (tabId: number) => {
				let termOptions = imported?.terms;
				if (!termOptions) {
					const results = await chrome.scripting.executeScript({
						target: { tabId },
						world: 'MAIN',
						func: lookupRegistrations,
						args: ['']
					});
					if (!session.active) return;
					const result = results[0]?.result;
					if (!result || 'error' in result) {
						if (result?.loginRequired) throw new StudentPageAuthError(REGISTRATION_HISTORY_URL);
						throw new Error(result?.error || 'Could not read enrolled terms from LeopardWeb.');
					}
					termOptions = result.termOptions;
					saveEnrolledTerms(termOptions);
				}
				const terms = termOptions.filter((term) => /^\d{6}$/.test(term.id)).map((term) => term.id);
				if (!terms.length)
					throw new Error(
						'LeopardWeb did not return any enrolled terms. Select Retry to try again.'
					);
				let loginError: StudentPageAuthError | undefined;
				const complete = await session.termProcessing.start(
					terms.filter((term) => term !== imported?.usedTermId),
					async (term) => {
						if (loginError) throw loginError;
						const results = await chrome.scripting.executeScript({
							target: { tabId },
							world: 'MAIN',
							func: lookupTermCourses,
							args: [term]
						});
						const result = results[0]?.result;
						if (!result || 'error' in result) {
							if (result?.loginRequired) {
								loginError = new StudentPageAuthError(REGISTRATION_HISTORY_URL);
								throw loginError;
							}
							throw new Error(result?.error || 'Could not read courses from LeopardWeb.');
						}
						return result.courses;
					}
				);
				if (loginError) throw loginError;
				return { complete };
			};
			return imported
				? process(imported.tabId)
				: withStudentPage(REGISTRATION_HISTORY_URL, process, () => session.active);
		},
		Boolean(imported)
	);
}

export async function importSchedule(
	session: PanelSession,
	termId?: string
): Promise<{ ics_url: string; termId: string } | undefined> {
	let tabToUse: chrome.tabs.Tab | undefined;
	let shouldCloseTab = false;
	try {
		const [currentTab] = await chrome.tabs.query({
			active: true,
			currentWindow: true
		});

		tabToUse = currentTab;
		if (currentTab?.url !== REGISTRATION_HISTORY_URL) {
			tabToUse = await openRegistrationTab();
			shouldCloseTab = true;
			if (!tabToUse.id) return;

			// If CAS redirected us to the login page the user isn't authenticated.
			const finalTab = await chrome.tabs.get(tabToUse.id);
			if (!finalTab.url?.startsWith('https://selfservice.wit.edu/')) {
				shouldCloseTab = false;
				throw new Error('Please log in to LeopardWeb (selfservice.wit.edu) and try again.');
			}
		}

		if (!tabToUse?.id) return;

		const results = await chrome.scripting.executeScript({
			target: { tabId: tabToUse.id },
			world: 'MAIN',
			func: lookupRegistrations,
			args: [termId ?? '']
		});

		const result = results[0]?.result;
		if (!session.active) return;
		if (!result) {
			throw new Error('Unexpected response from LeopardWeb');
		}
		if ('error' in result) {
			throw new Error(result.error);
		}

		const termOptions: TermOption[] = result.termOptions ?? [];
		const registrations = result.registrations ?? [];
		const usedTermId: string = result.usedTermId ?? String(termId);

		// Persist the authoritative enrolled terms from the Banner dropdown
		saveEnrolledTerms(termOptions);

		if (registrations.length === 0) {
			const termName = termOptions.find((t) => t.id === usedTermId)?.name ?? usedTermId;
			const available = termOptions.map((t) => t.name).join(', ');
			throw new Error(
				`You have no classes for ${termName}.` +
					(available ? ` Your schedule is available for: ${available}.` : '')
			);
		}

		// Map Banner registration records to the format the backend expects
		const coursesArray = registrationCourses(registrations);

		const response = await API.processCourses(coursesArray);
		if (!session.active) return;
		const importTabId = tabToUse.id;
		const closeImportTab = shouldCloseTab;
		shouldCloseTab = false;
		void getCourseSync(session)
			.run({
				tabId: importTabId,
				terms: termOptions,
				usedTermId
			})
			.finally(async () => {
				if (closeImportTab) await chrome.tabs.remove(importTabId).catch(() => {});
			});

		if (typeof response === 'string') {
			return { ics_url: response, termId: usedTermId };
		}
		return { ...response, termId: usedTermId };
	} catch (e) {
		console.error('Failed to fetch from current page:', e);
		throw e;
	} finally {
		if (shouldCloseTab && tabToUse?.id) {
			await chrome.tabs.remove(tabToUse.id);
		}
	}
}

export async function fetchRegistrationEvents(
	termId: string
): Promise<{ termOptions: TermOption[]; events: unknown } | undefined> {
	// Scrape current courses from LeopardWeb
	let shouldCloseTab = false;
	const [currentTab] = await chrome.tabs.query({
		active: true,
		currentWindow: true
	});

	let tabToUse = currentTab;
	if (currentTab?.url !== REGISTRATION_HISTORY_URL) {
		tabToUse = await openRegistrationTab();
		shouldCloseTab = true;
		if (!tabToUse.id) return;
		const finalTab = await chrome.tabs.get(tabToUse.id);
		if (!finalTab.url?.startsWith('https://selfservice.wit.edu/')) {
			throw new Error('Please log in to LeopardWeb (selfservice.wit.edu) and try again.');
		}
	}

	if (!tabToUse?.id) return;

	let results;
	try {
		results = await chrome.scripting.executeScript({
			target: { tabId: tabToUse.id },
			world: 'MAIN',
			func: lookupRegistrations,
			args: [termId, false]
		});
	} finally {
		if (shouldCloseTab) await chrome.tabs.remove(tabToUse.id);
	}

	const refreshResult = results[0]?.result;
	if (!refreshResult) {
		throw new Error('Unexpected response from LeopardWeb');
	}
	if ('error' in refreshResult) {
		throw new Error(refreshResult.error);
	}

	const termOptions: TermOption[] = refreshResult.termOptions ?? [];
	saveEnrolledTerms(termOptions);
	const events = registrationCourses(refreshResult.registrations);
	return { termOptions, events };
}
