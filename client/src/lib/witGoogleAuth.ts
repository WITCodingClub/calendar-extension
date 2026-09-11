import { EnvironmentManager } from './environment';

/**
 * Gets a Google access token for the student's WIT account.
 *
 * WIT mail runs on Microsoft, but the school provisions every student a limited
 * Google Workspace account on the wit.edu domain. Only WIT can issue one, so a
 * Google token for an @wit.edu address is what proves the caller holds a WIT
 * account. The backend keys the account to that verified address.
 *
 * chrome.identity.getAuthToken is deliberately not used here: it returns a
 * token for whichever account the Chrome profile is signed into, which for most
 * students is their personal account. launchWebAuthFlow instead runs the flow
 * against the browser's Google session, so the student can pick the WIT account
 * they are already signed into for LeopardWeb.
 *
 * `hd` asks Google to offer only wit.edu accounts. It is a convenience, not a
 * control: the backend re-checks the domain against the verified token, which
 * is the check that actually matters.
 */

export const WIT_HOSTED_DOMAIN = 'wit.edu';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [ 'email', 'profile' ];

/**
 * @param loginHint the WIT address scraped from LeopardWeb, used only to
 *   pre-select the right account in Google's chooser. The backend ignores it
 *   and reads the address from the verified token instead.
 */
export async function getWitGoogleAccessToken(loginHint?: string): Promise<string> {
    const clientId = await EnvironmentManager.getGoogleClientId();
    const redirectUri = chrome.identity.getRedirectURL();

    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
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

    // The implicit flow returns the token in the fragment, not the query.
    const fragment = new URLSearchParams(new URL(responseUrl).hash.slice(1));

    const error = fragment.get('error');
    if (error) {
        throw new Error(`Google rejected the sign-in: ${error}`);
    }

    const accessToken = fragment.get('access_token');
    if (!accessToken) {
        throw new Error('Google did not return a sign-in token');
    }

    return accessToken;
}
