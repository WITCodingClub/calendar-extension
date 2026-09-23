import { beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn(async (_url: string) => {});
vi.mock('$app/navigation', () => ({ goto: (url: string) => goto(url) }));
vi.mock('$app/environment', () => ({ browser: false }));
const api = vi.hoisted(() => ({
    credentials: [] as Array<Record<string, unknown>>
}));
vi.mock('./api', () => ({
    API: { getConnectedAccounts: vi.fn(async () => ({ oauth_credentials: api.credentials })) }
}));
vi.mock('./passkeys', () => ({
    passkeysSupported: vi.fn(async () => false),
    listPasskeys: vi.fn(async () => [])
}));

const telemetry = vi.hoisted(() => ({ asked: false }));
vi.mock('./telemetry', () => ({ usageStatsAsked: vi.fn(async () => telemetry.asked) }));

import { continueAfterSignIn, getCalendarState } from './afterSignIn';

function credential(overrides: Record<string, unknown> = {}) {
    return {
        id: 'cred_1',
        email: 'student@wit.edu',
        provider: 'google',
        needs_reauth: false,
        token_revoked: false,
        has_calendar: true,
        ...overrides
    };
}

let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};
    api.credentials = [];
    telemetry.asked = false;
    goto.mockClear();
    vi.stubGlobal('chrome', {
        storage: {
            local: {
                get: vi.fn(async (key: string) => (key in storage ? { [key]: storage[key] } : {})),
                set: vi.fn(async (items: Record<string, unknown>) => {
                    Object.assign(storage, items);
                }),
                remove: vi.fn(async (key: string) => {
                    delete storage[key];
                })
            }
        }
    });
});

describe('getCalendarState', () => {
    // A student who connected Outlook alone has a working calendar, so
    // onboarding must not send them back to the Google email form.
    it('counts a working Outlook calendar as connected', async () => {
        api.credentials = [credential({ provider: 'microsoft', email: 'student@wit.edu' })];

        expect(await getCalendarState()).toBe('connected');
        expect(storage.oauth_email).toBe('student@wit.edu');
    });

    it('asks for a new sign-in when every calendar credential is expired', async () => {
        api.credentials = [credential({ provider: 'microsoft', needs_reauth: true })];

        expect(await getCalendarState()).toBe('needs_reauth');
    });

    it('is missing when no credential has a calendar', async () => {
        api.credentials = [credential({ has_calendar: false })];

        expect(await getCalendarState()).toBe('missing');
    });
});

describe('continueAfterSignIn', () => {
    it('asks about usage counts first, and keeps the passkey offer for later', async () => {
        await continueAfterSignIn({ offerPasskey: true });

        expect(goto).toHaveBeenCalledWith('/usage-stats');
        expect(storage.offer_passkey_setup).toBe(true);
    });

    it('goes on to onboarding after the student chose', async () => {
        telemetry.asked = true;

        await continueAfterSignIn();

        expect(goto).toHaveBeenCalledWith('/onboard');
    });

    it('opens the calendar for a student who connected Outlook only', async () => {
        telemetry.asked = true;
        api.credentials = [credential({ provider: 'microsoft' })];

        await continueAfterSignIn();

        expect(goto).toHaveBeenCalledWith('/calendar');
    });
});
