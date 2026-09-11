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
 * is their personal one. launchWebAuthFlow runs the flow against the browser's
 * Google session instead, so the student can pick the WIT account they are
 * already signed into for LeopardWeb.
 *
 * The flow is authorization code with PKCE. Google has retired the implicit
 * grant for new integrations, and PKCE needs no client secret — which matters,
 * because an extension cannot keep one. Google documents client_secret as not
 * applicable to Chrome clients for exactly this reason.
 *
 * `hd` asks Google to offer only wit.edu accounts. It is a convenience, not a
 * control: the backend re-checks the domain against the verified token, which
 * is the check that actually matters.
 */

export const WIT_HOSTED_DOMAIN = 'wit.edu';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
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

/**
 * @param loginHint the WIT address scraped from LeopardWeb, used only to
 *   pre-select the right account in Google's chooser. The backend ignores it
 *   and reads the address from the verified token instead.
 */
export async function getWitGoogleAccessToken(loginHint?: string): Promise<string> {
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

    const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: url.toString(),
        interactive: true
    });

    if (!responseUrl) {
        throw new Error('Google sign-in was closed before it finished');
    }

    // The code flow returns its result in the query string, not the fragment.
    const params = new URL(responseUrl).searchParams;

    const error = params.get('error');
    if (error) {
        throw new Error(`Google rejected the sign-in: ${error}`);
    }

    const code = params.get('code');
    if (!code) {
        throw new Error('Google did not return an authorization code');
    }

    // No client secret: PKCE proves this is the same client that started the
    // flow, and Google does not apply client_secret to Chrome clients.
    const exchange = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        })
    });

    if (!exchange.ok) {
        const detail = await exchange.text().catch(() => '');
        throw new Error(`Google refused the token exchange (${exchange.status}) ${detail}`);
    }

    const token = await exchange.json() as { access_token?: string };
    if (!token.access_token) {
        throw new Error('Google did not return a sign-in token');
    }

    return token.access_token;
}
