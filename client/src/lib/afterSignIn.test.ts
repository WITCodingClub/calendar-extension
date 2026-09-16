import { beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn(async (_url: string) => {});
vi.mock('$app/navigation', () => ({ goto: (url: string) => goto(url) }));
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('./api', () => ({
    API: { getConnectedAccounts: vi.fn(async () => ({ oauth_credentials: [] })) }
}));
vi.mock('./passkeys', () => ({
    passkeysSupported: vi.fn(async () => false),
    listPasskeys: vi.fn(async () => [])
}));

const telemetry = vi.hoisted(() => ({ asked: false }));
vi.mock('./telemetry', () => ({ usageStatsAsked: vi.fn(async () => telemetry.asked) }));

import { continueAfterSignIn } from './afterSignIn';

let storage: Record<string, unknown>;

beforeEach(() => {
    storage = {};
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
});
