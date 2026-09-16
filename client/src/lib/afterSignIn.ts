import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { API } from './api';
import { AuthError } from './auth';
import { listPasskeys, passkeysSupported } from './passkeys';

const OFFER_PASSKEY_SETUP_KEY = 'offer_passkey_setup';

export type GoogleCalendarState = 'connected' | 'needs_reauth' | 'missing';

export async function getGoogleCalendarState(): Promise<GoogleCalendarState> {
    try {
        const accounts = await API.getConnectedAccounts();
        const credentials = accounts.oauth_credentials ?? [];
        const connected = credentials.find(
            (account) =>
                account.email &&
                !account.token_revoked &&
                !account.needs_reauth &&
                account.has_calendar !== false
        );
        if (connected) {
            await chrome.storage.local.set({ oauth_email: connected.email });
            return 'connected';
        }
        if (credentials.some((account) => account.email && (account.token_revoked || account.needs_reauth))) {
            return 'needs_reauth';
        }
    } catch (err) {
        if (err instanceof AuthError) {
            throw err;
        }
    }

    return 'missing';
}

export async function hasUsableGoogleCalendar(): Promise<boolean> {
    return (await getGoogleCalendarState()) === 'connected';
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
    if (browser && localStorage.getItem('isOtherCalendar') === 'true') {
        await goto('/calendar');
        return;
    }

    const googleCalendar = await getGoogleCalendarState();
    if (googleCalendar === 'connected') {
        await chrome.storage.local.remove(OFFER_PASSKEY_SETUP_KEY);
        await goto('/calendar');
        return;
    }

    if (googleCalendar === 'needs_reauth') {
        await goto('/gcalendar');
        return;
    }

    const stored = await chrome.storage.local.get(OFFER_PASSKEY_SETUP_KEY);
    const shouldOffer = options?.offerPasskey === true || stored[OFFER_PASSKEY_SETUP_KEY] === true;

    if (shouldOffer && await shouldPromptPasskeySetup()) {
        await chrome.storage.local.set({ [OFFER_PASSKEY_SETUP_KEY]: true });
        await goto('/passkey-setup');
        return;
    }

    await goto('/onboard');
}
