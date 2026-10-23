import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
	fetchAcademicProfile,
	lookupAcademicProfile,
	STUDENT_PROFILE_URL
} from './academicProfile';

vi.mock('../browser/tabs', () => ({ createWitTab: vi.fn() }));
import { createWitTab } from '../browser/tabs';

function setup(url = STUDENT_PROFILE_URL, status = 'complete') {
	const listeners = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
	const browser = {
		tabs: {
			query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []),
			get: vi.fn(async () => ({ id: 7, url, status })),
			remove: vi.fn(async () => {}),
			onUpdated: listeners(),
			onRemoved: listeners()
		},
		scripting: {
			executeScript: vi.fn(
				async (): Promise<unknown[]> => [{ result: { profile: { program: 'Computer Science' } } }]
			)
		}
	};
	vi.mocked(createWitTab).mockResolvedValue({ id: 7 } as chrome.tabs.Tab);
	vi.stubGlobal('chrome', browser);
	return browser;
}

beforeEach(() => {
	vi.clearAllMocks();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('opens Student Profile and reads HTML in the loaded page without fetching an endpoint', async () => {
	const browser = setup();
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	expect(await fetchAcademicProfile()).toEqual({ program: 'Computer Science' });
	expect(createWitTab).toHaveBeenCalledWith(STUDENT_PROFILE_URL);
	expect(browser.scripting.executeScript).toHaveBeenCalledWith({
		target: { tabId: 7 },
		world: 'MAIN',
		func: lookupAcademicProfile
	});
	expect(browser.tabs.remove).toHaveBeenCalledWith(7);
	expect(fetch).not.toHaveBeenCalled();
});

it('reuses an existing profile tab without closing it', async () => {
	const browser = setup();
	browser.tabs.query.mockResolvedValue([
		{ id: 7, url: STUDENT_PROFILE_URL.replace(/#$/, '') } as chrome.tabs.Tab
	]);
	await fetchAcademicProfile();
	expect(createWitTab).not.toHaveBeenCalled();
	expect(browser.tabs.remove).not.toHaveBeenCalled();
});

it.each(['https://login.example.invalid', 'https://selfservice.wit.edu/StudentSelfService/login'])(
	'preserves a login redirect to %s without injecting',
	async (url) => {
		const browser = setup(url);
		await expect(fetchAcademicProfile()).rejects.toThrow('log in to LeopardWeb');
		expect(browser.scripting.executeScript).not.toHaveBeenCalled();
		expect(browser.tabs.remove).not.toHaveBeenCalled();
	}
);

it('times out a stalled tab and removes listeners and the owned tab', async () => {
	vi.useFakeTimers();
	const browser = setup(undefined, 'loading');
	const result = expect(fetchAcademicProfile()).rejects.toThrow('did not finish loading');
	await vi.advanceTimersByTimeAsync(30_000);
	await result;
	expect(browser.tabs.onUpdated.removeListener).toHaveBeenCalled();
	expect(browser.tabs.onRemoved.removeListener).toHaveBeenCalled();
	expect(browser.tabs.remove).toHaveBeenCalledWith(7);
});

it('handles a closed tab while loading', async () => {
	const browser = setup(undefined, 'loading');
	browser.tabs.onRemoved.addListener.mockImplementation((listener: (id: number) => void) => {
		queueMicrotask(() => listener(7));
	});
	await expect(fetchAcademicProfile()).rejects.toThrow('was closed');
	expect(browser.scripting.executeScript).not.toHaveBeenCalled();
	expect(browser.tabs.onUpdated.removeListener).toHaveBeenCalled();
});

it.each([{ results: [] }, { results: [{ result: { error: 'The profile did not load' } }] }])(
	'rejects missing or failed extraction results',
	async ({ results }) => {
		const browser = setup();
		browser.scripting.executeScript.mockResolvedValue(results);
		await expect(fetchAcademicProfile()).rejects.toThrow();
		expect(browser.tabs.remove).toHaveBeenCalledWith(7);
	}
);

it('discards a late result after its session ends', async () => {
	const browser = setup();
	let active = true;
	browser.scripting.executeScript.mockImplementation(async () => {
		active = false;
		return [{ result: { profile: { program: 'Old account' } } }];
	});
	expect(await fetchAcademicProfile(() => active)).toBeUndefined();
	expect(browser.tabs.remove).toHaveBeenCalledWith(7);
});

it('does not open a tab for an inactive session', async () => {
	setup();
	expect(await fetchAcademicProfile(() => false)).toBeUndefined();
	expect(createWitTab).not.toHaveBeenCalled();
});
