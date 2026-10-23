import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../browser/environment', () => ({
	ENVIRONMENTS: { prod: { baseUrl: 'https://calendar.example.test' } },
	EnvironmentManager: {
		getEnvironmentData: vi.fn(async () => ({
			current_environment: 'prod',
			jwt_tokens: { prod: 'header.payload.signature' }
		})),
		getBaseUrl: vi.fn(async () => 'https://calendar.example.test'),
		getJwtToken: vi.fn(async () => 'header.payload.signature')
	}
}));

vi.mock('../auth/session', () => ({
	AuthError: class AuthError extends Error {},
	handleUnauthorized: vi.fn(),
	isUsableJwt: vi.fn(() => true)
}));

import { API } from './index';
import type { AcademicProfile } from '../calendar/academicProfile';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

describe('academic data endpoints', () => {
	it('reads and completes the independent server-side backfill flags', async () => {
		const initial = {
			past_terms: { completed: false, completed_at: null },
			academic_data: { completed: false, completed_at: null }
		};
		const done = {
			...initial,
			academic_data: { completed: true, completed_at: '2026-10-23T12:00:00Z' }
		};
		fetchMock.mockResolvedValueOnce(json(initial)).mockResolvedValueOnce(json(done));
		expect(await API.getBackfills()).toEqual(initial);
		expect(await API.completeBackfill('academic_data')).toEqual(done);
		expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
			['https://calendar.example.test/api/user/backfills', 'GET'],
			['https://calendar.example.test/api/user/backfills/academic_data', 'PUT']
		]);
	});
	it('rejects malformed or unconfirmed backfill state', async () => {
		fetchMock.mockResolvedValueOnce(json({}));
		await expect(API.getBackfills()).rejects.toThrow('Invalid backfill state');
		fetchMock.mockResolvedValueOnce(
			json({
				past_terms: { completed: false, completed_at: null },
				academic_data: { completed: false, completed_at: null }
			})
		);
		await expect(API.completeBackfill('academic_data')).rejects.toThrow('not recorded');
	});
	const profile: AcademicProfile = {
		source: 'leopardweb',
		level: 'Undergraduate',
		class_standing: null,
		admit_type: null,
		admit_term: null,
		programs: []
	};
	it('sends the academic profile with normal extension authentication', async () => {
		fetchMock.mockResolvedValue(json({ ...profile, programs: [] }));
		await API.saveAcademicProfile(profile);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://calendar.example.test/api/user/academic_profile');
		expect(init?.method).toBe('PUT');
		expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer header.payload.signature');
		expect(JSON.parse(String(init?.body))).toEqual(profile);
	});
	it('sends complete per-term outcome lists in batches of at most thirty terms', async () => {
		const terms = Array.from({ length: 31 }, (_, index) => ({
			term: `${2000 + index}10`,
			courses: [{ crn: '1', outcome: 'c_or_better' as const }]
		}));
		fetchMock.mockImplementation(async (_url, init) =>
			json({
				terms: JSON.parse(String(init?.body)).terms.map((term: { term: string }) => ({
					term: term.term,
					updated: 1,
					unknown_crns: []
				}))
			})
		);
		expect((await API.saveCourseOutcomes({ terms })).terms).toHaveLength(31);
		expect(
			fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).terms.length)
		).toEqual([30, 1]);
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://calendar.example.test/api/user/course_outcomes'
		);
		expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
	});
	it('skips an empty outcomes payload and rejects oversized terms before sending', async () => {
		expect(await API.saveCourseOutcomes({ terms: [] })).toEqual({ terms: [] });
		await expect(
			API.saveCourseOutcomes({
				terms: [
					{
						term: '202610',
						courses: Array.from({ length: 31 }, (_, index) => ({
							crn: String(index),
							outcome: 'failed'
						}))
					}
				]
			})
		).rejects.toThrow('30 course outcomes');
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it('preserves invalid_term errors for display and rejects malformed outcome responses', async () => {
		fetchMock.mockResolvedValueOnce(
			json({ error: 'Invalid catalog term', code: 'invalid_term' }, 422)
		);
		await expect(API.saveAcademicProfile(profile)).rejects.toMatchObject({
			status: 422,
			code: 'invalid_term'
		});
		fetchMock.mockResolvedValueOnce(json({ terms: [] }));
		await expect(
			API.saveCourseOutcomes({ terms: [{ term: '202610', courses: [] }] })
		).rejects.toThrow('Invalid course outcomes response');
	});
});

describe('API.requestOAuthForEmail', () => {
	it('starts OAuth for an existing linked email', async () => {
		const email = 'linked@example.test';
		const response = { oauth_url: 'https://calendar.example.test/auth/google_oauth2' };
		fetchMock.mockImplementation(async () => json(response));

		expect(await API.requestOAuthForEmail(email)).toEqual(response);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://calendar.example.test/api/user/google_calendar');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({ email });
	});
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
			json({
				pub_id: 'usr_1',
				email: 'student@wit.edu',
				ics_url: 'https://calendar.example.test/calendar/abc.ics'
			})
		);

		expect(await API.getUserEmail()).toEqual({ email: 'student@wit.edu' });
		expect(await API.getIcsUrl()).toEqual({
			ics_url: 'https://calendar.example.test/calendar/abc.ics'
		});
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
