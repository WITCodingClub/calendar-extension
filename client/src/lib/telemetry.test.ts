import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./environment', () => ({
    EnvironmentManager: { getBaseUrl: vi.fn(async () => 'https://calendar.example.test') }
}));

import { detectBrowser, setUsageStatsEnabled, track, usageStatsEnabled } from './telemetry';

const CHROME_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const EDGE_UA = `${CHROME_UA} Edg/140.0`;
const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; rv:142.0) Gecko/20100101 Firefox/142.0';

let storage: Record<string, unknown>;
let dataCollection: string[];
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(null, { status: 204 })
);

function useBrowser(userAgent: string) {
    vi.stubGlobal('navigator', { userAgent });
}

function sentBody() {
    return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
}

beforeEach(() => {
    storage = {};
    dataCollection = [];
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
        storage: {
            local: {
                get: vi.fn(async (key: string) => (key in storage ? { [key]: storage[key] } : {})),
                set: vi.fn(async (items: Record<string, unknown>) => {
                    Object.assign(storage, items);
                })
            }
        },
        permissions: {
            getAll: vi.fn(async () => ({ data_collection: dataCollection })),
            request: vi.fn(async () => {
                dataCollection = ['technicalAndInteraction'];
                return true;
            }),
            remove: vi.fn(async () => {
                dataCollection = [];
                return true;
            })
        },
        runtime: { getManifest: () => ({ version: '4.0.1' }) }
    });
    useBrowser(CHROME_UA);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('detectBrowser', () => {
    it('names Firefox, Edge, and Chrome', () => {
        expect(detectBrowser(FIREFOX_UA)).toBe('firefox');
        expect(detectBrowser(EDGE_UA)).toBe('edge');
        expect(detectBrowser(CHROME_UA)).toBe('chrome');
    });
});

describe('track', () => {
    it('sends the event, the version, and the browser, and nothing else', async () => {
        await track('schedule_import_succeeded');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://calendar.example.test/api/extension_events');
        expect(init).toMatchObject({ method: 'POST', keepalive: true });
        expect(init?.headers).not.toHaveProperty('Authorization');
        expect(sentBody()).toEqual({ events: ['schedule_import_succeeded'], version: '4.0.1', browser: 'chrome' });
    });

    it('sends nothing after the student turns the counts off', async () => {
        expect(await setUsageStatsEnabled(false)).toBe(false);

        await track('calendar_link_copied');

        expect(await usageStatsEnabled()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not throw when the request fails', async () => {
        fetchMock.mockRejectedValueOnce(new Error('offline'));

        await expect(track('calendar_link_copied')).resolves.toBeUndefined();
    });
});

describe('in Firefox', () => {
    beforeEach(() => useBrowser(FIREFOX_UA));

    it('sends nothing without the data collection permission', async () => {
        await track('passkey_created');

        expect(await usageStatsEnabled()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks Firefox for the permission and sends once it is granted', async () => {
        expect(await setUsageStatsEnabled(true)).toBe(true);
        expect(chrome.permissions.request).toHaveBeenCalledWith({ data_collection: ['technicalAndInteraction'] });

        await track('passkey_created');

        expect(sentBody()).toMatchObject({ browser: 'firefox' });
    });

    it('gives the permission back when the student turns the counts off', async () => {
        dataCollection = ['technicalAndInteraction'];

        expect(await setUsageStatsEnabled(false)).toBe(false);
        expect(await usageStatsEnabled()).toBe(false);
    });
});
