import { API } from '../api';
import { createWitTab } from '../browser/tabs';
import type { PanelSession } from '../panel/session';
import { enrolledTerms } from '../stores';
import type { ProcessingTerm } from '../types';

export const REGISTRATION_HISTORY_URL =
	'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/registrationHistory/registrationHistory';

type TermOption = { id: string; name: string };
type RegistrationsLookupResult =
	| { error: string }
	| { termOptions: TermOption[]; registrations: unknown[]; usedTermId: string };
type RegistrationEventsLookupResult =
	| { error: string }
	| { termOptions: TermOption[]; events: unknown };
type TermCoursesLookupResult = { error: string } | { courses: ProcessingTerm['courses'] };

async function lookupRegistrations(termIdArg: string): Promise<RegistrationsLookupResult> {
	try {
		// Extract the student's enrolled terms from the page dropdown
		const select = document.querySelector<HTMLSelectElement>('#lookupFilter');
		const termOptions = select
			? Array.from(select.options).map((o) => ({ id: o.value, name: o.text.trim() }))
			: [];

		// If the requested term isn't in the enrolled list, fall back to the first enrolled term
		let actualTermId = termIdArg;
		if (termOptions.length > 0 && !termOptions.some((t) => t.id === actualTermId)) {
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
				headers: {
					Accept: 'application/json, text/javascript, */*; q=0.01',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			}
		);
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
				headers: {
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
					...(token ? { 'X-Synchronizer-Token': token } : {})
				}
			}
		);
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

async function lookupRegistrationEvents(): Promise<RegistrationEventsLookupResult> {
	try {
		// Extract enrolled terms from the page dropdown
		const select = document.querySelector<HTMLSelectElement>('#lookupFilter');
		const termOptions = select
			? Array.from(select.options).map((o) => ({ id: o.value, name: o.text.trim() }))
			: [];

		const r = await fetch(
			'https://selfservice.wit.edu/StudentRegistrationSsb/ssb/classRegistration/getRegistrationEvents?termFilter=',
			{ credentials: 'include' }
		);
		const events = await r.json();
		return { termOptions, events };
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
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
		const registrations: any[] = result.registrations ?? [];
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
		const coursesArray = registrations.map((reg: any) => ({
			crn: reg.courseReferenceNumber,
			term: reg.term,
			courseNumber: reg.courseNumber
		}));

		const response = await API.processCourses(coursesArray);
		if (!session.active) return;
		const remaining = termOptions.filter((term) => term.id !== usedTermId && /^\d+$/.test(term.id));
		if (remaining.length) {
			const importTabId = tabToUse.id;
			const closeImportTab = shouldCloseTab;
			shouldCloseTab = false;
			void session.termProcessing
				.start(
					remaining.map((term) => term.id),
					async (term) => {
						const results = await chrome.scripting.executeScript({
							target: { tabId: importTabId },
							world: 'MAIN',
							func: lookupTermCourses,
							args: [term]
						});
						const result = results[0]?.result;
						if (!result || 'error' in result)
							throw new Error(result?.error || 'Unexpected response from LeopardWeb');
						return result.courses;
					}
				)
				.finally(async () => {
					if (closeImportTab) await chrome.tabs.remove(importTabId).catch(() => {});
				});
		}

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

export async function fetchRegistrationEvents(): Promise<
	{ termOptions: TermOption[]; events: unknown } | undefined
> {
	// Scrape current courses from LeopardWeb
	let shouldCloseTab = false;
	const [currentTab] = await chrome.tabs.query({
		active: true,
		currentWindow: true
	});

	let tabToUse = currentTab;
	if (currentTab.url !== REGISTRATION_HISTORY_URL) {
		tabToUse = await openRegistrationTab();
		shouldCloseTab = true;
		if (!tabToUse.id) return;
	}

	if (!tabToUse?.id) return;

	const results = await chrome.scripting.executeScript({
		target: { tabId: tabToUse.id },
		world: 'MAIN',
		func: lookupRegistrationEvents,
		args: []
	});

	if (shouldCloseTab && tabToUse?.id) {
		await chrome.tabs.remove(tabToUse.id);
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
	return { termOptions, events: refreshResult.events ?? [] };
}
