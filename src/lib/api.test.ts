import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./environment', () => ({
    EnvironmentManager: {
        getBaseUrl: vi.fn(async () => 'https://calendar.example.test'),
        getJwtToken: vi.fn(async () => 'header.payload.signature')
    }
}));

vi.mock('./auth', () => ({
    AuthError: class AuthError extends Error {},
    handleUnauthorized: vi.fn(),
    isUsableJwt: vi.fn(() => true)
}));

import { API } from './api';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});

describe('API.getTerms', () => {
    it('reads the current and the next term from the catalog API', async () => {
        fetchMock.mockImplementation(async (url) =>
            url.endsWith('/terms/current')
                ? json({ data: { uid: 202710, name: 'Fall 2026', season: 'fall', year: 2026 } })
                : json({ data: { uid: 202720, name: 'Spring 2027', season: 'spring', year: 2027 } })
        );

        const terms = await API.getTerms();

        expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
            'https://calendar.example.test/api/v1/catalog/terms/current',
            'https://calendar.example.test/api/v1/catalog/terms/next'
        ]);
        expect(terms.current_term).toMatchObject({ id: 202710, name: 'Fall 2026' });
        expect(terms.next_term).toMatchObject({ id: 202720, name: 'Spring 2027' });
    });

    it('gives null for a term that the catalog does not have yet', async () => {
        fetchMock.mockImplementation(async (url) =>
            url.endsWith('/terms/current')
                ? json({ data: { uid: 202710, name: 'Fall 2026', season: 'fall', year: 2026 } })
                : json({ error: 'No next term', code: 'NOT_FOUND' }, 404)
        );

        const terms = await API.getTerms();

        expect(terms.next_term).toBeNull();
    });
});

describe('API calls that moved to new paths', () => {
    it('reads the email and the ICS URL from GET /api/user', async () => {
        fetchMock.mockImplementation(async () =>
            json({ pub_id: 'usr_1', email: 'student@wit.edu', ics_url: 'https://calendar.example.test/calendar/abc.ics' })
        );

        expect(await API.getUserEmail()).toEqual({ email: 'student@wit.edu' });
        expect(await API.getIcsUrl()).toEqual({ ics_url: 'https://calendar.example.test/calendar/abc.ics' });
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://calendar.example.test/api/user',
            'https://calendar.example.test/api/user'
        ]);
    });

    it('reads one feature flag from the full list', async () => {
        fetchMock.mockImplementation(async () => json({ feature_flags: { friends: true } }));

        expect(await API.checkFeatureFlag('friends')).toBe(true);
        expect(await API.checkFeatureFlag('unknown')).toBe(false);
        expect(fetchMock.mock.calls[0][0]).toBe('https://calendar.example.test/api/user/feature_flags');
    });

    it('asks for processed events with GET and a query string', async () => {
        fetchMock.mockImplementation(async () => json({ classes: [] }));

        await API.getProcessedEvents('202710');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://calendar.example.test/api/user/processed_events?term_uid=202710');
        expect(init?.method).toBe('GET');
        expect(init?.body).toBeUndefined();
    });

    it('turns notifications off and on with PATCH /api/user/notifications', async () => {
        fetchMock.mockImplementation(async () => json({ notifications_disabled: true }));

        await API.disableNotifications(3600);
        await API.enableNotifications();

        const [[offUrl, off], [onUrl, on]] = fetchMock.mock.calls;
        expect(offUrl).toBe('https://calendar.example.test/api/user/notifications');
        expect(off?.method).toBe('PATCH');
        expect(JSON.parse(String(off?.body))).toEqual({ disabled: true, duration: 3600 });
        expect(onUrl).toBe('https://calendar.example.test/api/user/notifications');
        expect(JSON.parse(String(on?.body))).toEqual({ disabled: false });
    });
});

describe('API.saveFriendGroup', () => {
    it('omits unchanged expiry and sends date-only changes and explicit clearing', async () => {
        fetchMock.mockImplementation(async () => json({ group: {
            id: 'group-study', name: 'Study group', members: [], expires_at: null
        } }));

        await API.saveFriendGroup('Study group', [], undefined, '2026-11-01');
        await API.saveFriendGroup('Renamed group', ['friend-ada'], 'group-study');
        await API.saveFriendGroup(undefined, undefined, 'group-study', null);

        const calls = fetchMock.mock.calls;
        expect(calls.map(([url, init]) => [url, init?.method, JSON.parse(String(init?.body))])).toEqual([
            ['https://calendar.example.test/api/friends/groups', 'POST', { name: 'Study group', member_ids: [], expires_at: '2026-11-01' }],
            ['https://calendar.example.test/api/friends/groups/group-study', 'PATCH', { name: 'Renamed group', member_ids: ['friend-ada'] }],
            ['https://calendar.example.test/api/friends/groups/group-study', 'PATCH', { expires_at: null }]
        ]);
    });
});
