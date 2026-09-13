import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { API } from './api';

export async function continueAfterSignIn(): Promise<void> {
    if (browser && localStorage.getItem('isOtherCalendar') === 'true') {
        await goto('/calendar');
        return;
    }

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
            await goto('/calendar');
            return;
        }
    } catch {
    }

    await goto('/onboard');
}
