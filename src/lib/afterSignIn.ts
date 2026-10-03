import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { API } from './api';
import { AuthError } from './auth';
import { listPasskeys, passkeysSupported } from './passkeys';
import type { OAuthCredential } from './types';
import { usageStatsAsked } from './telemetry';

const OFFER_PASSKEY_SETUP_KEY = 'offer_passkey_setup';

export type CalendarState = 'connected' | 'needs_reauth' | 'missing';

// A course calendar in Google or in Outlook counts. A student who connected
// Outlook alone is connected, and onboarding must not ask for a Google email.
const CALENDAR_PROVIDERS = ['google', 'microsoft'];

function syncs(account: OAuthCredential): boolean {
	return (
		CALENDAR_PROVIDERS.includes(account.provider) &&
		Boolean(account.email) &&
		!account.token_revoked &&
		!account.needs_reauth &&
		account.has_calendar !== false
	);
}

export async function getCalendarState(): Promise<CalendarState> {
	try {
		const accounts = await API.getConnectedAccounts();
		const credentials = accounts.oauth_credentials ?? [];
		const connected = credentials.find(syncs);
		if (connected) {
			await chrome.storage.local.set({ oauth_email: connected.email });
			return 'connected';
		}
		if (
			credentials.some(
				(account) =>
					CALENDAR_PROVIDERS.includes(account.provider) &&
					account.email &&
					(account.token_revoked || account.needs_reauth)
			)
		) {
			return 'needs_reauth';
		}
	} catch (err) {
		if (err instanceof AuthError) {
			throw err;
		}
	}

	return 'missing';
}

export async function hasUsableCalendar(): Promise<boolean> {
	return (await getCalendarState()) === 'connected';
}

async function shouldPromptPasskeySetup(): Promise<boolean> {
	if (!(await passkeysSupported())) {
		return false;
	}

	try {
		const passkeys = await listPasskeys();
		return passkeys.length === 0;
	} catch (err) {
		if (err instanceof AuthError) {
			throw err;
		}
		return false;
	}
}

export async function isPasskeySetupPending(): Promise<boolean> {
	const stored = await chrome.storage.local.get(OFFER_PASSKEY_SETUP_KEY);
	return stored[OFFER_PASSKEY_SETUP_KEY] === true;
}

export async function finishPasskeySetup(): Promise<void> {
	await chrome.storage.local.remove(OFFER_PASSKEY_SETUP_KEY);
	await goto('/onboard');
}

export async function continueAfterSignIn(options?: { offerPasskey?: boolean }): Promise<void> {
	// Ask about usage counts once, before any other step. The prompt page calls
	// this function again, so keep the passkey offer in storage for that call.
	if (!(await usageStatsAsked())) {
		if (options?.offerPasskey) {
			await chrome.storage.local.set({ [OFFER_PASSKEY_SETUP_KEY]: true });
		}
		await goto('/usage-stats');
		return;
	}

	if (browser && localStorage.getItem('isOtherCalendar') === 'true') {
		await goto('/calendar');
		return;
	}

	const calendar = await getCalendarState();
	if (calendar === 'connected') {
		await chrome.storage.local.remove(OFFER_PASSKEY_SETUP_KEY);
		await goto('/calendar');
		return;
	}

	if (calendar === 'needs_reauth') {
		await goto('/gcalendar');
		return;
	}

	const stored = await chrome.storage.local.get(OFFER_PASSKEY_SETUP_KEY);
	const shouldOffer = options?.offerPasskey === true || stored[OFFER_PASSKEY_SETUP_KEY] === true;

	if (shouldOffer && (await shouldPromptPasskeySetup())) {
		await chrome.storage.local.set({ [OFFER_PASSKEY_SETUP_KEY]: true });
		await goto('/passkey-setup');
		return;
	}

	await goto('/onboard');
}
