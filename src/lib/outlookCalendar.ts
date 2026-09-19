import { API, ApiRequestError } from './api';
import { openAuthWindowUntil } from './authWindow';
import { EnvironmentManager } from './environment';
import { featureFlags } from './featureFlags';
import type { CalendarPlacement, OAuthCredential } from './types';

// The backend ends the Microsoft sign-in on /oauth/success or /oauth/failure.
const RESULT_PATH = '/oauth';

export type OutlookConnectResult =
	| { status: 'connected'; email: string }
	| { status: 'cancelled' }
	| { status: 'failed'; error: string }
	| { status: 'unavailable' };

export function isWorkingOutlookAccount(account: OAuthCredential): boolean {
	// The backend sets needs_reauth for a revoked token too. The client checks
	// both, so it does not depend on that rule.
	return (
		account.provider === 'microsoft' &&
		!account.token_revoked &&
		!account.needs_reauth &&
		account.has_calendar === true
	);
}

// What the Settings row says about where the classes go, and what the button
// asks for. The wording follows the dashboard, so both places warn the same.
export function placementCopy(placement: CalendarPlacement): {
	text: string;
	button: string;
	switchTo: CalendarPlacement;
	warning: string;
} {
	if (placement === 'primary') {
		return {
			text: 'Classes are in your main calendar and show as busy.',
			button: 'Use a separate calendar',
			switchTo: 'separate',
			warning:
				'Your classes move to a separate "WIT Courses" calendar. They no longer show as busy to other people. Changes you made to class events in Outlook are lost.'
		};
	}

	return {
		text: 'Classes are in a separate "WIT Courses" calendar. They do not show as busy.',
		button: 'Show classes as busy',
		switchTo: 'primary',
		warning:
			'Your classes move to your main calendar. People who can see your calendar see the class events. The "WIT Courses" calendar is removed, and changes you made to class events in Outlook are lost.'
	};
}

/**
 * Starts a move of the course events to the other placement.
 *
 * The backend answers before the move is complete, so the credentials keep
 * the old placement until the job finishes.
 */
export async function moveOutlookCalendar(
	placement: CalendarPlacement
): Promise<{ status: 'started' } | { status: 'failed'; error: string }> {
	try {
		await API.setMicrosoftCalendarPlacement(placement);
		return { status: 'started' };
	} catch (e) {
		console.error('Failed to move the Outlook classes:', e);
		return { status: 'failed', error: errorText(e, 'Could not move your classes') };
	}
}

function errorText(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

async function loadQuietly(
	loadAccounts: () => Promise<OAuthCredential[]>
): Promise<OAuthCredential[]> {
	try {
		return await loadAccounts();
	} catch (e) {
		console.error('Failed to refresh accounts:', e);
		return [];
	}
}

async function workingOutlookIds(
	loadAccounts: () => Promise<OAuthCredential[]>
): Promise<Set<string>> {
	const accounts = await loadQuietly(loadAccounts);
	return new Set(accounts.filter(isWorkingOutlookAccount).map((a) => a.id));
}

// A Microsoft credential that works now and did not work before this attempt.
function newWorkingOutlookAccount(
	accounts: OAuthCredential[],
	before: Set<string>
): OAuthCredential | undefined {
	return accounts.find((a) => isWorkingOutlookAccount(a) && !before.has(a.id));
}

/**
 * Connects or reconnects an Outlook calendar in a sign-in popup.
 *
 * The result is "connected" only when the reloaded credentials hold a working
 * Microsoft credential that this sign-in produced. The popup normally ends on
 * /oauth/success, but the service worker closes that page too, so a popup that
 * disappears without a result page still counts as connected when a new
 * working credential is there. A popup that the user closes leaves the
 * credentials unchanged, and that is a cancel.
 *
 * @param loadAccounts Reloads every credential from the backend. Each caller
 *   passes its own loader, so its credential list stays current.
 */
export async function connectOutlookCalendar(
	loadAccounts: () => Promise<OAuthCredential[]>
): Promise<OutlookConnectResult> {
	let oauthUrl: string;
	try {
		oauthUrl = (await API.requestMicrosoftCalendarOAuth()).oauth_url;
	} catch (e) {
		if (e instanceof ApiRequestError && e.status === 404) {
			// The flag is off for this user. Reload the flags to hide the Outlook UI.
			await featureFlags.reload();
			return { status: 'unavailable' };
		}
		console.error('Failed to start the Outlook calendar connection:', e);
		return { status: 'failed', error: errorText(e, 'Could not connect the Outlook calendar') };
	}

	// The credentials that already work. A reconnect must show the result of
	// this sign-in, not the state that an earlier one left.
	const before = await workingOutlookIds(loadAccounts);

	let landed: URL | null;
	try {
		const resultPrefix = `${new URL(await EnvironmentManager.getBaseUrl()).origin}${RESULT_PATH}`;
		landed = await openAuthWindowUntil(oauthUrl, resultPrefix);
	} catch (e) {
		console.error('Failed to open the Outlook sign-in window:', e);
		return { status: 'failed', error: errorText(e, 'Could not open the sign-in window') };
	}

	if (landed && !landed.pathname.endsWith('/success')) {
		await loadQuietly(loadAccounts);
		return {
			status: 'failed',
			error: landed.searchParams.get('error') || 'Could not connect the Outlook calendar'
		};
	}

	let accounts: OAuthCredential[];
	try {
		accounts = await loadAccounts();
	} catch (e) {
		console.error('Failed to refresh accounts:', e);
		if (!landed) return { status: 'cancelled' };
		return { status: 'failed', error: 'Could not confirm the Outlook connection. Try again.' };
	}

	const email = (landed?.searchParams.get('email') ?? '').toLowerCase();
	const confirmed =
		accounts.find((a) => isWorkingOutlookAccount(a) && a.email.toLowerCase() === email) ??
		newWorkingOutlookAccount(accounts, before);
	if (confirmed) {
		return { status: 'connected', email: confirmed.email };
	}

	// No result page and no new credential: the user closed the popup.
	if (!landed) return { status: 'cancelled' };

	return {
		status: 'failed',
		error: 'Outlook sign-in finished, but the calendar is not ready. Try again.'
	};
}
