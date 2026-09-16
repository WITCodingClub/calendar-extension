import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { snackbar } from 'm3-svelte';
import { EnvironmentManager } from './environment';
import { enrolledTerms, icsUrl, processedData, userSettings } from './store';

export class AuthError extends Error {
    readonly code: string;

    constructor(code = 'AUTH_UNAUTHORIZED') {
        super('Authentication required');
        this.name = 'AuthError';
        this.code = code;
    }
}

interface JwtPayload {
    exp?: number;
    jti?: string;
}

const CLOCK_SKEW_SECONDS = 30;
const PUBLIC_ROUTES = new Set([
    '/',
    '/loading',
    '/beta-access-denied',
    '/feature-access-denied'
]);

let sessionInvalidated = false;
let unauthorizedHandling: Promise<void> | undefined;
let clearingLocalData = false;

function decodeJwtPayload(token: string): JwtPayload | undefined {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return undefined;
    }

    try {
        const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
        return JSON.parse(json) as JwtPayload;
    } catch {
        return undefined;
    }
}

export function isUsableJwt(token: string | undefined | null): token is string {
    if (!token) {
        return false;
    }

    const payload = decodeJwtPayload(token);
    if (!payload?.exp || !payload.jti) {
        return false;
    }

    return payload.exp > Date.now() / 1000 + CLOCK_SKEW_SECONDS;
}

function routeKey(pathname: string): string {
    return pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
}

export function isPublicAuthPath(pathname: string): boolean {
    return PUBLIC_ROUTES.has(routeKey(pathname));
}

export async function persistSession(token: string): Promise<void> {
    sessionInvalidated = false;
    await EnvironmentManager.migrateOldJwtToken();
    await EnvironmentManager.setJwtToken(token);
}

export async function getUsableJwt(): Promise<string | undefined> {
    await EnvironmentManager.migrateOldJwtToken();
    const token = await EnvironmentManager.getJwtToken();
    if (isUsableJwt(token)) {
        return token;
    }
    if (token) {
        await handleUnauthorized();
    }
    return undefined;
}

export async function handleUnauthorized(): Promise<void> {
    if (sessionInvalidated) {
        return unauthorizedHandling;
    }

    sessionInvalidated = true;
    unauthorizedHandling = (async () => {
        const token = await EnvironmentManager.getJwtToken();
        if (token) {
            await EnvironmentManager.clearJwtToken();
            if (browser) {
                snackbar('Your session expired. Please sign in again.', undefined, true);
            }
        }

        if (browser && !isPublicAuthPath(window.location.pathname)) {
            await goto('/', { replaceState: true });
        }
    })();

    try {
        await unauthorizedHandling;
    } finally {
        unauthorizedHandling = undefined;
    }
}

export async function clearLocalData(): Promise<void> {
    if (!browser || clearingLocalData) {
        return;
    }

    clearingLocalData = true;
    sessionInvalidated = false;
    try {
        await chrome.storage.local.clear();
        localStorage.clear();
        sessionStorage.clear();
        userSettings.set(undefined);
        processedData.set([]);
        enrolledTerms.set([]);
        icsUrl.set(undefined);
        snackbar('Local data cleared successfully', undefined, true);
        await goto(resolve('/'), { replaceState: true });
    } finally {
        clearingLocalData = false;
    }
}

export async function guardCurrentRoute(): Promise<void> {
    if (!browser) {
        return;
    }

    if (isPublicAuthPath(window.location.pathname)) {
        return;
    }

    const jwt = await getUsableJwt();
    if (!jwt) {
        await handleUnauthorized();
    }
}
