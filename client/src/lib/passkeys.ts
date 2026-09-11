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
 * Chrome 122 and later let an extension page claim a relying party id for any
 * domain in its host permissions. The manifest covers https://*.witcc.dev/*,
 * so the ceremony runs against the backend's own relying party id and the
 * credential is the same one the dashboard would create. The origin the
 * browser reports is chrome-extension://<id>, so that origin has to be in the
 * backend's WEBAUTHN_ORIGINS list.
 */

/** A credential id as the backend sends it: base64url, not a buffer. */
interface EncodedCredentialDescriptor {
    type: string;
    id: string;
    transports?: string[];
}

/**
 * The options the backend returns, with every binary field still base64url
 * encoded. The unlisted fields (rp, pubKeyCredParams, timeout, and so on) pass
 * straight through to the browser untouched.
 */
interface EncodedOptions {
    challenge: string;
    user?: { id: string; name: string; displayName: string };
    excludeCredentials?: EncodedCredentialDescriptor[];
    allowCredentials?: EncodedCredentialDescriptor[];
    [key: string]: unknown;
}

interface CeremonyStart {
    handle: string;
    options: EncodedOptions;
}

/** How long sign-in waits for the authenticator before falling back to Google. */
const SIGN_IN_TIMEOUT_MS = 60_000;

export interface PasskeySummary {
    id: string;
    nickname: string;
    created_at: string;
    last_used_at: string | null;
}

/** Returns an ArrayBuffer, which is what the WebAuthn options expect. */
function base64UrlToBytes(value: string): ArrayBuffer {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
}

function bytesToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Firefox gives each installation a random moz-extension:// origin, so there is
 * no fixed origin for the backend to allow. Until that changes, passkeys are
 * Chromium only and Firefox keeps the Google flow.
 */
function originCanBeAllowlisted(): boolean {
    return location.protocol !== 'moz-extension:';
}

/** Can this browser and device run the ceremony at all? */
export async function passkeysSupported(): Promise<boolean> {
    if (typeof PublicKeyCredential === 'undefined' || !originCanBeAllowlisted()) {
        return false;
    }

    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

async function start(path: string, token?: string): Promise<CeremonyStart> {
    const baseUrl = await API.baseUrl;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers });
    if (!response.ok) {
        throw new Error(`Could not start the passkey step (${response.status})`);
    }
    return response.json();
}

/**
 * Registers a passkey for the signed-in user. Requires a JWT, so call it only
 * after onboarding has succeeded.
 */
export async function registerPasskey(nickname?: string): Promise<PasskeySummary> {
    const token = await API.getJwtToken();
    if (!token) {
        throw new Error('Sign in before adding a passkey');
    }

    const { handle, options } = await start('/user/passkeys/registration_options', token);

    // The backend sends every binary field base64url encoded; the browser wants
    // buffers. The rest of the options pass straight through.
    const publicKey = {
        ...options,
        challenge: base64UrlToBytes(options.challenge),
        user: {
            ...options.user!,
            id: base64UrlToBytes(options.user!.id)
        },
        excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
            ...c,
            id: base64UrlToBytes(c.id)
        }))
    } as PublicKeyCredentialCreationOptions;

    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;

    if (!credential) {
        throw new Error('No passkey was created');
    }

    const attestation = credential.response as AuthenticatorAttestationResponse;
    const baseUrl = await API.baseUrl;

    const response = await fetch(`${baseUrl}/user/passkeys`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            handle,
            nickname,
            credential: {
                type: credential.type,
                id: credential.id,
                rawId: bytesToBase64Url(credential.rawId),
                authenticatorAttachment: credential.authenticatorAttachment,
                response: {
                    attestationObject: bytesToBase64Url(attestation.attestationObject),
                    clientDataJSON: bytesToBase64Url(attestation.clientDataJSON)
                }
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Could not save the passkey (${response.status})`);
    }

    const data = await response.json();
    return data.passkey;
}

/**
 * Signs in with a passkey and stores the JWT it returns.
 *
 * Returns false when the user has no passkey for this site or dismisses the
 * prompt, which is the signal to fall back to the Google flow. It throws only
 * when something actually went wrong.
 */
export async function signInWithPasskey(): Promise<boolean> {
    const { handle, options } = await start('/user/passkeys/authentication_options');

    const publicKey = {
        ...options,
        challenge: base64UrlToBytes(options.challenge),
        allowCredentials: (options.allowCredentials ?? []).map((c) => ({
            ...c,
            id: base64UrlToBytes(c.id)
        }))
    } as PublicKeyCredentialRequestOptions;

    // This runs before onboarding, so a browser that never answers must not
    // leave the student staring at a spinner. Give up and let Google take over.
    const abort = new AbortController();
    const giveUp = setTimeout(() => abort.abort(), SIGN_IN_TIMEOUT_MS);

    let credential: PublicKeyCredential | null;
    try {
        credential = await navigator.credentials.get({ publicKey, signal: abort.signal }) as PublicKeyCredential | null;
    } catch (err) {
        // NotAllowedError covers both "no passkey here" and "user closed the
        // prompt". Neither is an error worth showing — fall back to Google.
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
            return false;
        }
        throw err;
    } finally {
        clearTimeout(giveUp);
    }

    if (!credential) {
        return false;
    }

    const assertion = credential.response as AuthenticatorAssertionResponse;
    const baseUrl = await API.baseUrl;

    const response = await fetch(`${baseUrl}/user/passkeys/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            handle,
            credential: {
                type: credential.type,
                id: credential.id,
                rawId: bytesToBase64Url(credential.rawId),
                authenticatorAttachment: credential.authenticatorAttachment,
                response: {
                    authenticatorData: bytesToBase64Url(assertion.authenticatorData),
                    clientDataJSON: bytesToBase64Url(assertion.clientDataJSON),
                    signature: bytesToBase64Url(assertion.signature),
                    userHandle: assertion.userHandle ? bytesToBase64Url(assertion.userHandle) : null
                }
            }
        })
    });

    if (response.status === 401) {
        return false;
    }

    if (!response.ok) {
        throw new Error(`Passkey sign-in failed (${response.status})`);
    }

    const data = await response.json() as { jwt?: string };
    if (!data.jwt) {
        return false;
    }

    await EnvironmentManager.setJwtToken(data.jwt);
    return true;
}

/** Lists the passkeys on the signed-in account. */
export async function listPasskeys(): Promise<PasskeySummary[]> {
    const baseUrl = await API.baseUrl;
    const response = await fetch(`${baseUrl}/user/passkeys`, {
        headers: { 'Authorization': `Bearer ${await API.getJwtToken()}` }
    });

    if (!response.ok) {
        throw new Error(`Could not list passkeys (${response.status})`);
    }

    const data = await response.json();
    return data.passkeys;
}

/** Removes one passkey from the signed-in account. */
export async function removePasskey(passkeyId: string): Promise<void> {
    const baseUrl = await API.baseUrl;
    const response = await fetch(`${baseUrl}/user/passkeys/${passkeyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${await API.getJwtToken()}` }
    });

    if (!response.ok) {
        throw new Error(`Could not remove the passkey (${response.status})`);
    }
}
