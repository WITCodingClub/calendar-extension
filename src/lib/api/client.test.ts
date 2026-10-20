import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, handleUnauthorized, isUsableJwt } from '../auth/session';
import { ENVIRONMENTS } from '../browser/environment';
import { getBaseUrl, getJwtToken, request } from './client';

vi.mock('../auth/session', () => ({
	AuthError: class AuthError extends Error {},
	handleUnauthorized: vi.fn(),
	isUsableJwt: vi.fn()
}));

const storageGet = vi.fn();
const fetchMock = vi.fn();

function stored(token: string | undefined = 'original-token', environment = 'prod') {
	return {
		environment_data: {
			current_environment: environment,
			jwt_tokens: { prod: token, staging: token }
		}
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('chrome', { storage: { local: { get: storageGet } } });
	vi.stubGlobal('fetch', fetchMock);
	storageGet.mockResolvedValue(stored());
	vi.mocked(isUsableJwt).mockReturnValue(true);
	fetchMock.mockResolvedValue(new Response('{}'));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('request authentication snapshot', () => {
	it('reads storage once and preserves request options', async () => {
		const response = await request('/user', {
			method: 'PATCH',
			body: { enabled: true },
			headers: { 'X-Test': 'value' },
			cache: 'no-store'
		});

		expect(response.status).toBe(200);
		expect(storageGet).toHaveBeenCalledExactlyOnceWith('environment_data');
		expect(isUsableJwt).toHaveBeenCalledExactlyOnceWith('original-token');
		expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${ENVIRONMENTS.prod.baseUrl}/api/user`, {
			method: 'PATCH',
			body: '{"enabled":true}',
			headers: {
				Authorization: 'Bearer original-token',
				'Content-Type': 'application/json',
				'X-Test': 'value'
			},
			cache: 'no-store'
		});
	});

	it('takes a fresh snapshot for each request', async () => {
		await request('/user');
		storageGet.mockResolvedValue(stored('next-token', 'staging'));
		await request('/user');

		expect(storageGet).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenLastCalledWith(`${ENVIRONMENTS.staging.baseUrl}/api/user`, {
			method: 'GET',
			headers: { Authorization: 'Bearer next-token' }
		});
	});

	it.each([undefined, '', 'malformed-token', 'expired-token'])(
		'does not fetch with an unusable token: %s',
		async (token) => {
			storageGet.mockResolvedValue({
				environment_data: { current_environment: 'prod', jwt_tokens: { prod: token } }
			});
			vi.mocked(isUsableJwt).mockReturnValue(false);

			await expect(request('/user')).rejects.toBeInstanceOf(AuthError);

			expect(isUsableJwt).toHaveBeenCalledExactlyOnceWith(token);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(handleUnauthorized).toHaveBeenCalledOnce();
		}
	);

	it('invalidates an unchanged session after a 401', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

		await expect(request('/user')).rejects.toBeInstanceOf(AuthError);

		expect(storageGet).toHaveBeenCalledTimes(2);
		expect(handleUnauthorized).toHaveBeenCalledOnce();
	});

	it.each([
		['changed token', stored('new-token')],
		['removed token', stored('')],
		['changed environment with the same token', stored('original-token', 'staging')]
	])('preserves a %s after a 401', async (_, current) => {
		fetchMock.mockImplementation(async () => {
			storageGet.mockResolvedValue(current);
			return new Response(null, { status: 401 });
		});

		await expect(request('/user')).rejects.toBeInstanceOf(AuthError);

		expect(storageGet).toHaveBeenCalledTimes(2);
		expect(handleUnauthorized).not.toHaveBeenCalled();
	});

	it('preserves a session when an overridden authorization header gets a 401', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

		await expect(
			request('/user', { headers: { Authorization: 'Bearer override-token' } })
		).rejects.toBeInstanceOf(AuthError);

		expect(handleUnauthorized).not.toHaveBeenCalled();
	});

	it('preserves the public URL and token helpers', async () => {
		expect(await getBaseUrl()).toBe(`${ENVIRONMENTS.prod.baseUrl}/api`);
		expect(await getJwtToken()).toBe('original-token');
	});
});
