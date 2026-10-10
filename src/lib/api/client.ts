import { EnvironmentManager } from '../browser/environment';
import { AuthError, handleUnauthorized, isUsableJwt } from '../auth/session';

export class ApiError extends Error {
	readonly status: number;
	readonly code?: string;

	constructor(message: string, status: number, body?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		if (body && typeof body === 'object') {
			const fields = body as Record<string, unknown>;
			if (typeof fields.code === 'string') this.code = fields.code;
		}
	}
}

export async function getBaseUrl(): Promise<string> {
	const baseUrl = await EnvironmentManager.getBaseUrl();
	return `${baseUrl}/api`;
}

export async function getJwtToken(): Promise<string | undefined> {
	const token = await EnvironmentManager.getJwtToken();
	return token;
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
	const token = await getJwtToken();
	if (!isUsableJwt(token)) {
		await handleUnauthorized();
		throw new AuthError();
	}

	const sentAuth = new Headers(init?.headers).get('Authorization');
	const response = await fetch(url, init);
	if (response.status === 401) {
		const currentToken = await getJwtToken();
		if (currentToken && sentAuth === `Bearer ${currentToken}`) {
			await handleUnauthorized();
		}
		throw new AuthError();
	}
	return response;
}

// Reads the body of a response that must succeed. A failed response becomes
// an error, so a caller never mistakes an error body for data and never
// writes one into a cache.
export async function readJson<T>(response: Response, failureMessage: string): Promise<T> {
	if (response.ok) {
		return response.json();
	}
	let message = `${failureMessage}: ${response.status}`;
	let body: unknown;
	try {
		body = await response.json();
		if (body && typeof body === 'object') {
			const fields = body as Record<string, unknown>;
			if (fields.error) message = String(fields.error);
			else if (fields.message) message = String(fields.message);
			else if (fields.detail) message = String(fields.detail);
		}
	} catch {
		/* ignore parse errors */
	}
	throw new ApiError(message, response.status, body);
}

type RequestOptions = {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
	cache?: RequestCache;
};

export async function request(
	path: string,
	{ method = 'GET', body, headers, cache }: RequestOptions = {}
): Promise<Response> {
	const baseUrl = await getBaseUrl();
	const token = await getJwtToken();
	return authedFetch(`${baseUrl}${path}`, {
		method,
		...(cache ? { cache } : {}),
		headers: {
			Authorization: `Bearer ${token}`,
			...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
			...headers
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
}

export async function requestJson<T = unknown>(
	path: string,
	failureMessage: string,
	options?: RequestOptions
): Promise<T> {
	return readJson<T>(await request(path, options), failureMessage);
}
