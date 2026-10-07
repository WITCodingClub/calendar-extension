import {
	test as base,
	expect,
	type BrowserContext,
	type Page,
	type Worker
} from '@playwright/test';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { now, origin, responseFor } from './backend';

type NetworkRow = {
	method: string;
	path: string;
	status: number;
	source: 'page' | 'worker';
	totalMs?: number;
	responseMs?: number;
};
type Extension = {
	context: BrowserContext;
	page: Page;
	worker: Worker;
	baseUrl: string;
	network: NetworkRow[];
	unexpected: string[];
	proxyDenied: string[];
	proxyUrl: string;
	allowedProbeHosts: Set<string>;
	open: (route?: string, signedIn?: boolean) => Promise<void>;
};
export const test = base.extend<{ extension: Extension }>({
	extension: async ({ playwright }, use, testInfo) => {
		const live = testInfo.project.name === 'live';
		if (live) {
			if (
				!process.env.WIT_LIVE_JWT ||
				!process.env.WIT_LIVE_EXPECTED_EMAIL ||
				process.env.WIT_LIVE_ACCOUNT_SCOPE !== 'isolated-staging'
			)
				throw new Error(
					'Live mode requires WIT_LIVE_JWT, WIT_LIVE_EXPECTED_EMAIL and WIT_LIVE_ACCOUNT_SCOPE=isolated-staging. See tests/ui/README.md.'
				);
			let claims;
			try {
				claims = JSON.parse(
					Buffer.from(process.env.WIT_LIVE_JWT.split('.')[1], 'base64url').toString()
				);
			} catch {
				throw new Error('Malformed live JWT');
			}
			const remaining = claims.exp - Date.now() / 1000;
			if (!claims.jti || !(remaining > 60 && remaining <= 3600))
				throw new Error(
					'Live JWT needs a jti and 1–60 minutes remaining; ask the staging operator for a short-lived session.'
				);
		}
		const extensionPath = path.resolve('extension');
		const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
		if (!manifest.key) throw new Error('Run npm run build-dev before UI tests.');
		const id = [
			...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)
		]
			.map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
			.join('');
		const baseUrl = `chrome-extension://${id}`;
		const unexpected: string[] = [],
			proxyDenied: string[] = [],
			errors: string[] = [];
		const network: NetworkRow[] = [];
		const rows = new WeakMap<import('@playwright/test').Request, NetworkRow>();
		const pending = new Set<import('@playwright/test').Request>();
		const allowedProbeHosts = new Set<string>();
		// Chromium background traffic and app-declared font preconnects are denied too.
		// Only proxy connection attempts are exempt from test failures; a fetch from
		// an extension page/worker to these hosts still hits the strict route below.
		const browserConnections = new Set([
			'clients2.google.com',
			'www.google.com',
			'accounts.google.com',
			'android.clients.google.com',
			'redirector.gvt1.com', // Chromium spellcheck dictionary downloads.
			'fonts.googleapis.com',
			'fonts.gstatic.com'
		]);
		// Never forwards requests. Covers extension workers/browser paths that bypass routing.
		const proxy = createServer((request, response) => {
			const host = new URL(request.url ?? '/', 'http://invalid').hostname;
			proxyDenied.push(host);
			if (!allowedProbeHosts.has(host) && !browserConnections.has(host))
				unexpected.push(`Unrouted HTTP request to ${host}`);
			response.writeHead(502).end();
		});
		const sockets = new Set<Socket>();
		proxy.on('connection', (socket) => {
			sockets.add(socket);
			socket.on('error', () => {});
			socket.on('close', () => sockets.delete(socket));
		});
		proxy.on('connect', (request, socket) => {
			const host = (request.url ?? '').split(':')[0];
			proxyDenied.push(host);
			if (!allowedProbeHosts.has(host) && !browserConnections.has(host))
				unexpected.push(`Unrouted HTTPS request to ${host}`);
			socket.on('error', () => {});
			socket.end('HTTP/1.1 502 Blocked by deterministic UI fixture\r\n\r\n');
		});
		proxy.on('clientError', (_error, socket) => socket.destroy());
		await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
		const address = proxy.address();
		if (!address || typeof address === 'string') throw new Error('Could not start egress guard');
		const proxyUrl = `http://127.0.0.1:${address.port}`;
		const profile = await mkdtemp(path.join(tmpdir(), 'wit-ui-'));
		if (
			path.dirname(profile) !== path.resolve(tmpdir()) ||
			!path.basename(profile).startsWith('wit-ui-')
		)
			throw new Error('Unsafe profile cleanup target');
		let context: BrowserContext | undefined;
		try {
			context = await playwright.chromium.launchPersistentContext(profile, {
				channel: 'chromium',
				headless: !process.env.WIT_UI_HEADED && !process.env.PWDEBUG,
				viewport: { width: 1280, height: 900 },
				timezoneId: 'America/New_York',
				locale: 'en-US',
				proxy: live ? undefined : { server: proxyUrl, bypass: '<-loopback>' },
				args: [
					`--disable-extensions-except=${extensionPath}`,
					`--load-extension=${extensionPath}`,
					'--disable-quic',
					'--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
				]
			});
			const ownedContext = context;
			context.setDefaultTimeout(8_000);
			context.on('request', (request) => {
				if (request.url().startsWith(`${origin}/api/`)) pending.add(request);
			});
			context.on('requestfailed', (request) => {
				pending.delete(request);
				if (rows.has(request)) unexpected.push('Controlled backend request failed');
			});
			await context.route('**/*', async (route) => {
				const request = route.request(),
					url = new URL(request.url());
				if (
					url.origin === baseUrl ||
					(url.protocol === 'chrome-extension:' && url.hostname === id) ||
					url.protocol === 'data:'
				)
					return route.continue();
				const method = request.method();
				if (url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2' && method === 'GET')
					return route.fulfill({ contentType: 'text/css', body: '' });
				if (!live && allowedProbeHosts.has(url.hostname) && url.pathname === '/__egress_probe__')
					return route.continue();
				const safePath = url.pathname
					.replace(/(\/friends\/)(?!requests(?:\/|$))[^/]+/g, '$1:friend')
					.replace(/(\/meeting_times\/)[^/]+(?=\/preference)/g, '$1:event');
				if (live) {
					// Staging reads only. Deliberate writes need their own authorized test scope.
					const readPost =
						/^(?:\/api\/user\/(?:is_processed|processed_events)|\/api\/friends\/[^/]+\/(?:is_processed|processed_events)|\/api\/meeting_times\/preferences)$/.test(
							url.pathname
						);
					const readGet =
						/^\/api\/(?:terms\/current_and_next|friends(?:\/requests)?|user\/(?:extension_config|email|notifications_status|oauth_credentials|passkeys|ics_url|feature_flags)|calendar_preferences|university_calendar_events\/(?:holidays|categories)|meeting_times\/[^/]+\/preference)$/.test(
							url.pathname
						);
					if (
						url.origin === origin &&
						((method === 'GET' && readGet) || (method === 'POST' && readPost))
					)
						return route.continue();
				} else if (url.origin === origin) {
					let body = null;
					try {
						body = request.postDataJSON();
					} catch {
						/* no JSON body */
					}
					const data = responseFor(method, url.pathname, body);
					if (data !== undefined) {
						const row: NetworkRow = {
							method,
							path: safePath,
							status: 200,
							source: request.serviceWorker() ? 'worker' : 'page'
						};
						network.push(row);
						rows.set(request, row);
						return route.fulfill({ status: 200, json: data });
					}
				}
				unexpected.push(`${method} ${url.hostname}${safePath}`);
				await route.abort('blockedbyclient');
			});
			if (!live)
				await context.routeWebSocket(/.*/, (socket) => {
					unexpected.push('Unexpected WebSocket');
					socket.close();
				});
			context.on('requestfinished', (request) => {
				pending.delete(request);
				const row = rows.get(request);
				if (row) {
					const timing = request.timing();
					row.totalMs = timing.responseEnd;
					row.responseMs = timing.responseStart;
				}
			});
			const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
			expect(new URL(worker.url()).hostname).toBe(id);
			expect(
				await worker.evaluate(() => ({
					id: chrome.runtime.id,
					name: chrome.runtime.getManifest().name,
					version: chrome.runtime.getManifest().version
				}))
			).toEqual({ id, name: manifest.name, version: manifest.version });
			const page = await context.newPage();
			context.on('page', (other) => other.on('pageerror', (error) => errors.push(error.message)));
			page.on('pageerror', (error) => errors.push(error.message));
			if (!live) await page.clock.setFixedTime(new Date(now));
			const open = async (route = 'calendar', signedIn = true) => {
				// Storage setup happens in the extension worker using the actual Chrome API.
				await worker.evaluate(
					async ({ signedIn, token }) => {
						await chrome.storage.local.clear();
						await chrome.storage.local.set({
							environment_data: {
								current_environment: 'staging',
								jwt_tokens: signedIn ? { staging: token } : {}
							},
							usage_stats_enabled: false,
							usage_stats_asked: true
						});
					},
					{
						signedIn,
						token: live
							? process.env.WIT_LIVE_JWT!
							: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ exp: 4102444800, jti: 'synthetic-ui-only' })).toString('base64url')}.unsigned`
					}
				);
				await page.goto(`${baseUrl}/${route}.html`);
			};
			await use({
				context: ownedContext,
				page,
				worker,
				baseUrl,
				network,
				unexpected,
				proxyDenied,
				proxyUrl,
				allowedProbeHosts,
				open
			});
			await expect
				.poll(() => pending.size, { message: 'Backend requests still pending at test completion' })
				.toBe(0);
			// Assertions include handled-but-unexpected requests, not just failed fetches.
			expect(unexpected, 'Unexpected external request (no production egress permitted)').toEqual(
				[]
			);
			expect(errors, 'Uncaught UI errors').toEqual([]);
		} finally {
			await context?.close();
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve, reject) =>
				proxy.close((error) => (error ? reject(error) : resolve()))
			);
			// Only the exact temp directory created above is eligible for cleanup.
			await rm(profile, { recursive: true, force: true, maxRetries: 3 });
		}
	}
});
export { expect };
