import { test, expect } from './extension.fixture';
import { origin, terms } from './backend';
import { fitsViewport } from './helpers';
import { request } from 'node:http';

test('signed-out route guards and local reset use only a disposable profile', async ({
	extension
}) => {
	const { page, open, worker } = extension;
	for (const route of ['calendar', 'friends', 'onboard', 'gcalendar', 'passkey-setup']) {
		await open(route, false);
		await expect(page.getByRole('button', { name: /Sign in with Google/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toHaveCount(0);
	}
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page);
		await expect(
			page.getByRole('button', { name: 'Sign in with Google', exact: true })
		).toBeVisible();
	}
	await worker.evaluate(() => chrome.storage.local.set({ reset_probe: true }));
	await page.evaluate(() => {
		localStorage.setItem('reset_probe', 'test');
		sessionStorage.setItem('reset_probe', 'test');
	});
	await page.keyboard.press('Control+Shift+Alt+Backspace');
	await expect(page.getByText('Local data cleared successfully')).toBeVisible();
	expect(await worker.evaluate(() => chrome.storage.local.get(null))).toEqual({});
	expect(
		await page.evaluate(() => [
			localStorage.getItem('reset_probe'),
			sessionStorage.getItem('reset_probe')
		])
	).toEqual([null, null]);
});

test('network interception covers extension pages and worker bypasses are contained', async ({
	extension
}) => {
	const { page, worker, proxyDenied, proxyUrl, allowedProbeHosts, unexpected } = extension;
	await extension.open();
	expect(
		await page.evaluate(
			async (url) => (await fetch(url)).json(),
			`${origin}/api/terms/current_and_next`
		)
	).toEqual(terms);
	// Probe an actual worker fetch, without replacing fetch or Chrome APIs.
	const workerResult = await worker.evaluate(async (url) => {
		try {
			return { data: await (await fetch(url)).json() };
		} catch {
			return { blocked: true };
		}
	}, `${origin}/api/terms/current_and_next`);
	expect(workerResult).toEqual({ data: terms });
	expect(extension.network.some((row) => row.source === 'worker')).toBe(true);
	// Browser-owned dictionary downloads bypass routing but must still be denied.
	const browserHost = 'redirector.gvt1.com';
	const beforeBrowserProbe = [...unexpected];
	const proxyStatus = await new Promise<number | undefined>((resolve, reject) => {
		const probe = request(proxyUrl, { method: 'CONNECT', path: `${browserHost}:443` });
		probe.once('connect', (response, socket) => {
			socket.destroy();
			resolve(response.statusCode);
		});
		probe.once('error', reject);
		probe.end();
	});
	expect(proxyStatus).toBe(502);
	expect(proxyDenied).toContain(browserHost);
	expect(unexpected).toEqual(beforeBrowserProbe);
	// The browser exception must not allow page or worker fetches to that host.
	const beforeFetchProbe = unexpected.length;
	const fetchBlocked = async (url: string) => {
		try {
			await fetch(url);
			return false;
		} catch {
			return true;
		}
	};
	const fetchUrl = `https://${browserHost}/__route_guard__`;
	expect(await page.evaluate(fetchBlocked, fetchUrl)).toBe(true);
	expect(await worker.evaluate(fetchBlocked, fetchUrl)).toBe(true);
	expect(unexpected.slice(beforeFetchProbe)).toEqual([
		`GET ${browserHost}/__route_guard__`,
		`GET ${browserHost}/__route_guard__`
	]);
	unexpected.splice(beforeFetchProbe); // Only these explicit containment probes are expected.
	const count = unexpected.length;
	const blocked = await page.evaluate(async () => {
		try {
			await fetch('https://calendar.witcc.dev/api/user/email');
			return false;
		} catch {
			return true;
		}
	});
	expect(blocked).toBe(true);
	expect(unexpected.slice(count)).toEqual(['GET calendar.witcc.dev/api/user/email']);
	unexpected.splice(count); // Only this explicit containment probe is expected.
	allowedProbeHosts.add('calendar.witcc.dev');
	expect(
		await worker.evaluate(async () => {
			try {
				await fetch('https://calendar.witcc.dev/__egress_probe__');
				return false;
			} catch {
				return true;
			}
		})
	).toBe(true);
	expect(proxyDenied).toContain('calendar.witcc.dev');
});
