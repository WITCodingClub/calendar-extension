import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENVIRONMENTS, EnvironmentManager } from './environment';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('EnvironmentManager.isReachable', () => {
    it('checks the health endpoint of the given environment', async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

        expect(await EnvironmentManager.isReachable('staging')).toBe(true);
        expect(fetchMock.mock.calls[0][0]).toBe(`${ENVIRONMENTS.staging.baseUrl}/up`);
    });

    it('reports an error status as offline', async () => {
        // An offline ngrok tunnel answers with its own error page.
        fetchMock.mockResolvedValueOnce(new Response('ERR_NGROK_3200', { status: 404 }));

        expect(await EnvironmentManager.isReachable('dev')).toBe(false);
    });

    it('reports a network failure as offline', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        expect(await EnvironmentManager.isReachable('dev')).toBe(false);
    });

    it('reports a timeout as offline', async () => {
        fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }));

        expect(await EnvironmentManager.isReachable('dev', 10)).toBe(false);
    });
});
