import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { API } from './api';
import { listPasskeys, passkeysSupported } from './passkeys';

const OFFER_PASSKEY_SETUP_KEY = 'offer_passkey_setup';

async function hasConnectedCalendar(): Promise<boolean> {
    try {
        const accounts = await API.getConnectedAccounts();
        const connected = accounts.oauth_credentials?.find(
            (account) =>
                account.email &&
                !account.token_revoked &&
                account.has_calendar !== false
        );
        if (connected) {
            await chrome.storage.local.set({ oauth_email: connected.email });
            return true;
        }
    } catch {
    }

    return false;
}

async function shouldPromptPasskeySetup(): Promise<boolean> {
    if (!(await passkeysSupported())) {
        return false;
    }

    try {
        const passkeys = await listPasskeys();
        return passkeys.length === 0;
    } catch {
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

    if (await hasConnectedCalendar()) {
        await chrome.storage.local.remove(OFFER_PASSKEY_SETUP_KEY);
        await goto('/calendar');
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
