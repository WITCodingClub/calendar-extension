import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthCredential } from './types';

const { ApiRequestError, ...mocks } = vi.hoisted(() => ({
	ApiRequestError: class ApiRequestError extends Error {
		readonly status: number;

		constructor(message: string, status: number) {
			super(message);
			this.name = 'ApiRequestError';
			this.status = status;
		}
	},
	requestMicrosoftCalendarOAuth: vi.fn(async () => ({ oauth_url: 'https://login.example/start' })),
	setMicrosoftCalendarPlacement: vi.fn(async (_placement: string) => ({ placement: _placement })),
	openAuthWindowUntil: vi.fn(async (): Promise<URL | null> => null),
	reload: vi.fn(async () => {})
}));

vi.mock('./api', () => ({
	ApiRequestError,
	API: {
		requestMicrosoftCalendarOAuth: mocks.requestMicrosoftCalendarOAuth,
		setMicrosoftCalendarPlacement: mocks.setMicrosoftCalendarPlacement
	}
}));
vi.mock('./authWindow', () => ({ openAuthWindowUntil: mocks.openAuthWindowUntil }));
vi.mock('./environment', () => ({
	EnvironmentManager: { getBaseUrl: vi.fn(async () => 'https://calendar.example') }
}));
vi.mock('./featureFlags', () => ({ featureFlags: { reload: mocks.reload } }));

import {
	connectOutlookCalendar,
	isWorkingOutlookAccount,
	moveOutlookCalendar,
	placementCopy
} from './outlookCalendar';

function credential(overrides: Partial<OAuthCredential> = {}): OAuthCredential {
	return {
		id: 'cred_1',
		email: 'student@wit.edu',
		provider: 'microsoft',
		needs_reauth: false,
		token_revoked: false,
		has_calendar: true,
		...overrides
	};
}

// The loader answers with a different list on each call, like the backend does
// before and after the sign-in.
function loaderFor(...lists: OAuthCredential[][]) {
	const calls = [...lists];
	return vi.fn(async () => (calls.length > 1 ? calls.shift()! : calls[0]));
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requestMicrosoftCalendarOAuth.mockResolvedValue({
		oauth_url: 'https://login.example/start'
	});
	mocks.openAuthWindowUntil.mockResolvedValue(null);
	mocks.setMicrosoftCalendarPlacement.mockImplementation(async (placement: string) => ({
		placement
	}));
});

describe('isWorkingOutlookAccount', () => {
	it('accepts a Microsoft credential with a calendar', () => {
		expect(isWorkingOutlookAccount(credential())).toBe(true);
	});

	it('refuses a Google credential, an expired sign-in, and a missing calendar', () => {
		expect(isWorkingOutlookAccount(credential({ provider: 'google' }))).toBe(false);
		expect(isWorkingOutlookAccount(credential({ needs_reauth: true }))).toBe(false);
		expect(isWorkingOutlookAccount(credential({ has_calendar: false }))).toBe(false);
	});

	// The backend sets needs_reauth for a revoked token, but the client must
	// not count a revoked credential as working on its own.
	it('refuses a credential whose access Microsoft revoked', () => {
		expect(isWorkingOutlookAccount(credential({ token_revoked: true }))).toBe(false);
	});
});

describe('placementCopy', () => {
	it('offers the main calendar for a separate one, and warns about the move', () => {
		const copy = placementCopy('separate');

		expect(copy.switchTo).toBe('primary');
		expect(copy.text).toContain('WIT Courses');
		expect(copy.warning).toContain('lost');
	});

	it('offers a separate calendar for the main one', () => {
		const copy = placementCopy('primary');

		expect(copy.switchTo).toBe('separate');
		expect(copy.text).toContain('busy');
	});
});

describe('moveOutlookCalendar', () => {
	it('asks the backend for the new placement', async () => {
		const result = await moveOutlookCalendar('primary');

		expect(mocks.setMicrosoftCalendarPlacement).toHaveBeenCalledWith('primary');
		expect(result).toEqual({ status: 'started' });
	});

	it('reports the backend error', async () => {
		mocks.setMicrosoftCalendarPlacement.mockRejectedValue(
			new ApiRequestError('No Microsoft calendar is connected', 404)
		);

		const result = await moveOutlookCalendar('separate');

		expect(result).toEqual({ status: 'failed', error: 'No Microsoft calendar is connected' });
	});
});

describe('connectOutlookCalendar', () => {
	it('watches the result pages on the API host', async () => {
		await connectOutlookCalendar(loaderFor([]));

		expect(mocks.openAuthWindowUntil).toHaveBeenCalledWith(
			'https://login.example/start',
			'https://calendar.example/oauth'
		);
	});

	it('reports the connection that the success page names', async () => {
		mocks.openAuthWindowUntil.mockResolvedValue(
			new URL('https://calendar.example/oauth/success?email=Student%40wit.edu')
		);

		const result = await connectOutlookCalendar(loaderFor([], [credential()]));

		expect(result).toEqual({ status: 'connected', email: 'student@wit.edu' });
	});

	it('reports a connection when the service worker closed the success page first', async () => {
		mocks.openAuthWindowUntil.mockResolvedValue(null);

		const result = await connectOutlookCalendar(loaderFor([], [credential()]));

		expect(result).toEqual({ status: 'connected', email: 'student@wit.edu' });
	});

	it('cancels when the popup closes and no new credential works', async () => {
		const working = credential();

		const result = await connectOutlookCalendar(loaderFor([working], [working]));

		expect(result).toEqual({ status: 'cancelled' });
	});

	it('reports the reason from the failure page', async () => {
		mocks.openAuthWindowUntil.mockResolvedValue(
			new URL('https://calendar.example/oauth/failure?error=Sign+in+with+your+own+account.')
		);

		const result = await connectOutlookCalendar(loaderFor([]));

		expect(result).toEqual({ status: 'failed', error: 'Sign in with your own account.' });
	});

	it('fails when the success page leaves no working credential', async () => {
		mocks.openAuthWindowUntil.mockResolvedValue(
			new URL('https://calendar.example/oauth/success?email=student@wit.edu')
		);

		const result = await connectOutlookCalendar(
			loaderFor([], [credential({ has_calendar: false })])
		);

		expect(result.status).toBe('failed');
	});

	it('reloads the flags and reports unavailable on a 404', async () => {
		mocks.requestMicrosoftCalendarOAuth.mockRejectedValue(
			new ApiRequestError('Microsoft calendar sync is not enabled', 404)
		);

		const result = await connectOutlookCalendar(loaderFor([]));

		expect(result).toEqual({ status: 'unavailable' });
		expect(mocks.reload).toHaveBeenCalled();
		expect(mocks.openAuthWindowUntil).not.toHaveBeenCalled();
	});

	it('reports the backend error when the start request fails', async () => {
		mocks.requestMicrosoftCalendarOAuth.mockRejectedValue(new ApiRequestError('Server error', 500));

		const result = await connectOutlookCalendar(loaderFor([]));

		expect(result).toEqual({ status: 'failed', error: 'Server error' });
	});
});
