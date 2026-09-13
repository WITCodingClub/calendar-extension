import { API } from './api';
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
 * that page with launchWebAuthFlow. On sign-in the page redirects back with a
 * short-lived code, which is traded for a JWT. On register it redirects with
 * ok=1 once the key is stored.
 *
 * Query the page understands:
 *   mode          authenticate | register
 *   redirect_uri  chrome.identity.getRedirectURL()
 *   nickname      optional, register only
 * Hash (register only, so the JWT is not in server logs):
 *   #token=<jwt>
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
    return typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow;
}

async function openPasskeyPage(params: {
    mode: 'authenticate' | 'register';
    nickname?: string;
    token?: string;
}): Promise<URLSearchParams | null> {
    const site = await EnvironmentManager.getBaseUrl();
    const redirectUri = chrome.identity.getRedirectURL();
    const url = new URL(`${site}/passkey`);
    url.searchParams.set('mode', params.mode);
    url.searchParams.set('redirect_uri', redirectUri);
    if (params.nickname) {
        url.searchParams.set('nickname', params.nickname);
    }
    if (params.token) {
        url.hash = `token=${encodeURIComponent(params.token)}`;
    }

    let responseUrl: string | undefined;
    try {
        responseUrl = await chrome.identity.launchWebAuthFlow({
            url: url.toString(),
            interactive: true
        });
    } catch {
        return null;
    }

    if (!responseUrl) {
        return null;
    }

    return new URL(responseUrl).searchParams;
}

export async function registerPasskey(nickname?: string): Promise<boolean> {
    const token = await API.getJwtToken();
    if (!token) {
        throw new Error('Sign in before adding a passkey');
    }

    const params = await openPasskeyPage({ mode: 'register', nickname, token });
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
    if (!params) {
        return false;
    }

    if (params.get('error')) {
        return false;
    }

    const code = params.get('code');
    if (!code) {
        return false;
    }

    const data = await API.exchangePasskeyCode(code);
    if (!data.jwt) {
        return false;
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
