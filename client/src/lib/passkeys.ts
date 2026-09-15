import { API } from './api';
import { openCenteredAuthWindow } from './authWindow';
import { EnvironmentManager } from './environment';

/**
 * Passkey sign-in for the extension.
 *
 * A passkey is a second way into an account the backend already tied to a
 * verified @wit.edu Google account. It never creates an account: registration
 * needs a session, so a passkey can only belong to someone who already signed
 * in with Google at least once.
 *
 * The ceremony runs on /passkey on the site, not in this origin. This opens
 * that page in a centered popup. On sign-in the page redirects back with a
 * short-lived code, which is traded for a JWT. On register it redirects with
 * ok=1 once the key is stored.
 *
 * Query the page understands:
 *   mode          authenticate | register
 *   redirect_uri  chrome.identity.getRedirectURL()
 *   nickname      optional, register only
 *   handoff       register only. A single-use, two-minute grant minted from our
 *                 JWT. The session token itself never travels in the URL: a
 *                 fragment keeps it out of server logs but not out of the
 *                 address bar, history, or any script on the page, and it is a
 *                 90-day credential. If a handoff leaks, it registers one
 *                 passkey within two minutes and nothing else.
 *
 * Redirect back:
 *   ?code=...              sign-in succeeded
 *   ?ok=1                  register succeeded
 *   ?error=cancelled       user dismissed, or no passkey here
 *   ?error=...             anything else
 */

export interface PasskeySummary {
    id: string;
    nickname: string;
    created_at: string;
    last_used_at: string | null;
}

export async function passkeysSupported(): Promise<boolean> {
    return typeof chrome !== 'undefined'
        && !!chrome.windows?.create
        && !!chrome.tabs?.onUpdated
        && !!chrome.identity?.getRedirectURL;
}

async function openPasskeyPage(params: {
    mode: 'authenticate' | 'register';
    nickname?: string;
    handoff?: string;
}): Promise<URLSearchParams | null> {
    const site = await EnvironmentManager.getBaseUrl();
    const redirectUri = chrome.identity.getRedirectURL();
    const url = new URL(`${site}/passkey`);
    url.searchParams.set('mode', params.mode);
    url.searchParams.set('redirect_uri', redirectUri);
    if (params.nickname) {
        url.searchParams.set('nickname', params.nickname);
    }
    if (params.handoff) {
        url.searchParams.set('handoff', params.handoff);
    }

    try {
        return await openCenteredAuthWindow(url.toString());
    } catch {
        return null;
    }
}

export async function registerPasskey(nickname?: string): Promise<boolean> {
    const token = await API.getJwtToken();
    if (!token) {
        throw new Error('Sign in before adding a passkey');
    }

    // The page holds no session, so trade our JWT for a grant that can do one
    // thing, once, for two minutes.
    const { code } = await API.createPasskeyHandoff();

    const params = await openPasskeyPage({ mode: 'register', nickname, handoff: code });
    if (!params) {
        return false;
    }

    const error = params.get('error');
    if (error === 'cancelled') {
        return false;
    }
    if (error) {
        throw new Error(error);
    }
    if (params.get('ok') !== '1') {
        throw new Error('No passkey was created');
    }

    return true;
}

export async function signInWithPasskey(): Promise<boolean> {
    const params = await openPasskeyPage({ mode: 'authenticate' });
    // Match Google auth: closed window / cancelled / missing code all fail
    // loudly so the sign-in page can show a snackbar. Quiet returns hide the
    // usual "no passkey on this device" case, which the site reports as
    // error=cancelled.
    if (!params) {
        throw new Error('Passkey sign-in was closed before it finished');
    }

    const error = params.get('error');
    if (error) {
        throw new Error(
            error === 'cancelled'
                ? 'Passkey sign-in was cancelled or no passkey is available on this device'
                : error
        );
    }

    const code = params.get('code');
    if (!code) {
        throw new Error('No passkey sign-in code returned');
    }

    const data = await API.exchangePasskeyCode(code);
    if (!data.jwt) {
        throw new Error('Passkey sign-in did not return a session');
    }

    await EnvironmentManager.setJwtToken(data.jwt);
    return true;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
    const data = await API.listPasskeys();
    return data.passkeys;
}

export async function removePasskey(passkeyId: string): Promise<void> {
    await API.deletePasskey(passkeyId);
}
