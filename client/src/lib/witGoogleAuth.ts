import { openCenteredAuthWindow } from './authWindow';
import { EnvironmentManager } from './environment';

/**
 * Gets a Google access token for the student's WIT account.
 *
 * WIT mail runs on Microsoft, but the school provisions every student a limited
 * Google Workspace account on the wit.edu domain. Only WIT can issue one, so a
 * Google token for an @wit.edu address is what proves the caller holds a WIT
 * account. The backend keys the account to that verified address.
 *
 * chrome.identity.getAuthToken is deliberately not used: it returns a token for
 * whichever account the browser profile is signed into, which for most students
 * is their personal one. The OAuth popup runs against the browser's Google
 * session instead, so the student can pick the WIT account they are already
 * signed into for LeopardWeb.
 *
 * The flow is authorization code with PKCE, and it stops at the code. Google
 * wants a client_secret at its token endpoint for a Web application client, and
 * a published extension is not a place to keep one — anyone can read it back
 * out of the package. So the backend finishes the exchange with the secret it
 * already holds, and this only ever handles a code.
 *
 * PKCE still spans both halves: the verifier stays here and travels with the
 * code, so a stolen code is useless without it.
 *
 * `hd` asks Google to offer only wit.edu accounts. It is a convenience, not a
 * control: the backend re-checks the domain against the verified token, which
 * is the check that actually matters.
 */

export const WIT_HOSTED_DOMAIN = 'wit.edu';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [ 'email', 'profile' ];

export function bytesToBase64Url(data: ArrayBuffer | Uint8Array): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): ArrayBuffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
}

/** A fresh PKCE verifier and its S256 challenge. */
async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
    const verifier = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

/** What the backend needs to finish the exchange. */
export interface WitGoogleAuthCode {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}

/**
 * @param loginHint the WIT address scraped from LeopardWeb, used only to
 *   pre-select the right account in Google's chooser. The backend ignores it
 *   and reads the address from the verified token instead.
 */
export async function getWitGoogleAuthCode(loginHint?: string): Promise<WitGoogleAuthCode> {
    const clientId = await EnvironmentManager.getGoogleClientId();
    const redirectUri = chrome.identity.getRedirectURL();
    const { verifier, challenge } = await createPkcePair();

    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('hd', WIT_HOSTED_DOMAIN);
    // Always show the chooser. Without it Google reuses the last account, which
    // is how a student ends up onboarding with the wrong one.
    url.searchParams.set('prompt', 'select_account');

    if (loginHint) {
        url.searchParams.set('login_hint', loginHint);
    }

    const params = await openCenteredAuthWindow(url.toString());

    if (!params) {
        throw new Error('Google sign-in was closed before it finished');
    }

    const error = params.get('error');
    if (error) {
        throw new Error(`Google rejected the sign-in: ${error}`);
    }

    const code = params.get('code');
    if (!code) {
        throw new Error('Google did not return an authorization code');
    }

    return { code, codeVerifier: verifier, redirectUri };
}
