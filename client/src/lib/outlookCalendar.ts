import { API, ApiRequestError } from './api';
import { openAuthWindowUntil } from './authWindow';
import { EnvironmentManager } from './environment';
import { featureFlags } from './featureFlags';
import type { OAuthCredential } from './types';

// The backend ends the Microsoft sign-in on /oauth/success or /oauth/failure.
const RESULT_PATH = '/oauth';

export type OutlookConnectResult =
	| { status: 'connected'; email: string }
	| { status: 'cancelled' }
	| { status: 'failed'; error: string }
	| { status: 'unavailable' };

export function isWorkingOutlookAccount(account: OAuthCredential): boolean {
	return account.provider === 'microsoft' && !account.needs_reauth && account.has_calendar === true;
}

function errorText(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

async function refreshQuietly(loadAccounts: () => Promise<OAuthCredential[]>): Promise<void> {
	try {
		await loadAccounts();
	} catch (e) {
		console.error('Failed to refresh accounts:', e);
	}
}

/**
 * Connects or reconnects an Outlook calendar in a sign-in popup.
 *
 * The result is "connected" only when the popup reached /oauth/success and the
 * reloaded credentials hold a working Microsoft credential for that email. A
 * popup that closes before a result page counts as cancelled, even when an
 * older Microsoft credential already works.
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

	let landed: URL | null;
	try {
		const resultPrefix = `${new URL(await EnvironmentManager.getBaseUrl()).origin}${RESULT_PATH}`;
		landed = await openAuthWindowUntil(oauthUrl, resultPrefix);
	} catch (e) {
		console.error('Failed to open the Outlook sign-in window:', e);
		return { status: 'failed', error: errorText(e, 'Could not open the sign-in window') };
	}

	if (!landed) {
		await refreshQuietly(loadAccounts);
		return { status: 'cancelled' };
	}

	if (!landed.pathname.endsWith('/success')) {
		await refreshQuietly(loadAccounts);
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
		return { status: 'failed', error: 'Could not confirm the Outlook connection. Try again.' };
	}

	const email = (landed.searchParams.get('email') ?? '').toLowerCase();
	const confirmed = accounts.find(
		(a) => isWorkingOutlookAccount(a) && a.email.toLowerCase() === email
	);
	if (!confirmed) {
		return {
			status: 'failed',
			error: 'Outlook sign-in finished, but the calendar is not ready. Try again.'
		};
	}

	return { status: 'connected', email: confirmed.email };
}
