import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, access, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createResponses } from './screenshot-data.js';

const { values } = parseArgs({ options: { config: { type: 'string' }, out: { type: 'string' } } });
const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = path.resolve(
	values.config ?? path.join(root, 'scripts/screenshots/config.json')
);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const configDir = path.dirname(configPath);
const outputDir = path.resolve(values.out ?? path.join(root, 'outScreenshots'));
const extensionPath = path.join(root, 'extension');
const origin = 'https://staging-calendar.witcc.dev';

if (!Array.isArray(config.screenshots) || !config.screenshots.length)
	throw new Error('Config must contain a non-empty screenshots array.');
await access(path.join(extensionPath, 'manifest.json')).catch(() => {
	throw new Error('Run npm run build-dev before taking screenshots.');
});

function target(page, spec, depth = 0) {
	if (!spec || depth > 10) throw new Error('Missing target or circular target alias.');
	if (typeof spec === 'string' && spec.startsWith('@')) {
		const alias = config.targets?.[spec.slice(1)];
		if (!alias) throw new Error(`Unknown target: ${spec}`);
		return target(page, alias, depth + 1);
	}
	const scope = spec.within ? target(page, spec.within, depth + 1) : page;
	let locator;
	if (typeof spec === 'string') locator = scope.locator(spec);
	else if (spec.css) locator = scope.locator(spec.css);
	else if (spec.role)
		locator = scope.getByRole(spec.role, { name: spec.name, exact: spec.exact ?? true });
	else if (spec.label) locator = scope.getByLabel(spec.label, { exact: spec.exact ?? true });
	else if (spec.text) locator = scope.getByText(spec.text, { exact: spec.exact ?? true });
	else throw new Error(`Invalid target: ${JSON.stringify(spec)}`);
	return spec.index === undefined ? locator : locator.nth(spec.index);
}

async function act(page, step, depth = 0) {
	if (depth > 10) throw new Error('Circular quick action.');
	if (typeof step === 'string') step = { action: 'use', name: step };
	switch (step.action) {
		case 'use': {
			const steps = config.quickActions?.[step.name];
			if (!Array.isArray(steps)) throw new Error(`Unknown quick action: ${step.name}`);
			for (const action of steps) await act(page, action, depth + 1);
			return;
		}
		case 'click':
			return target(page, step.target).click();
		case 'fill':
			return target(page, step.target).fill(step.value);
		case 'check':
			return target(page, step.target).setChecked(step.checked ?? true);
		case 'select':
			return target(page, step.target).selectOption(step.value);
		case 'hover':
			return target(page, step.target).hover();
		case 'press':
			return step.target
				? target(page, step.target).press(step.key)
				: page.keyboard.press(step.key);
		case 'waitFor':
			return target(page, step.target).waitFor({ state: step.state ?? 'visible' });
		case 'scroll':
			if (step.target) return target(page, step.target).scrollIntoViewIfNeeded();
			return page.evaluate(({ x = 0, y = 0 }) => window.scrollTo(x, y), step);
		default:
			throw new Error(`Unknown action: ${step.action}`);
	}
}

const names = new Set();
for (const shot of config.screenshots) {
	if (!shot.name || !/^[\w-]+$/.test(shot.name) || names.has(shot.name))
		throw new Error(
			'Screenshot names must be unique and use letters, numbers, underscores or hyphens.'
		);
	names.add(shot.name);
	if (typeof shot.route !== 'string' || !/^\/(?!\/)/.test(shot.route))
		throw new Error(`${shot.name}: route must be an extension path starting with /.`);
	const dataFile = shot.data ?? config.data;
	const data = dataFile
		? JSON.parse(await readFile(path.resolve(configDir, dataFile), 'utf8'))
		: {};
	const responseFor = createResponses({
		...data,
		settings: { ...data.settings, ...config.settings, ...shot.settings }
	});
	const unexpected = new Set();
	const context = await chromium.launchPersistentContext('', {
		channel: 'chromium',
		headless: true,
		viewport: shot.viewport ?? config.viewport ?? { width: 1280, height: 900 },
		colorScheme: 'dark',
		timezoneId: config.timezone ?? 'America/New_York',
		locale: 'en-US',
		args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
	});
	try {
		context.setDefaultTimeout(10_000);
		context.on('page', (page) => {
			page.on('pageerror', (error) => console.error(error.message));
			page.on('console', (message) => {
				const expectedMissingTerm =
					message.location().url === `${origin}/api/v1/catalog/terms/next` &&
					message.text().includes('404');
				if (message.type() === 'error' && !expectedMissingTerm) console.error(message.text());
			});
		});
		await context.route('**/*', async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return route.continue();
			if (url.origin === origin) {
				const body = request.postData() ? request.postDataJSON() : null;
				const response = responseFor(request.method(), url.pathname, body);
				if (response !== undefined)
					return route.fulfill({ status: response === null ? 404 : 200, json: response });
			}
			if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')
				return route.continue();
			unexpected.add(`${request.method()} ${url.origin}${url.pathname}`);
			await route.abort();
		});
		const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
		const extensionId = new URL(worker.url()).hostname;
		const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ exp: 4102444800, jti: 'synthetic-screenshot-only' })).toString('base64url')}.unsigned`;
		await worker.evaluate(
			async ({ token, signedIn }) => {
				await chrome.storage.local.set({
					environment_data: {
						current_environment: 'staging',
						jwt_tokens: signedIn ? { staging: token } : {}
					},
					usage_stats_enabled: false,
					usage_stats_asked: true
				});
			},
			{ token, signedIn: shot.signedIn ?? true }
		);
		const page = await context.newPage();
		await page.clock.setFixedTime(
			new Date(shot.date ?? config.date ?? '2026-10-06T12:00:00-04:00')
		);
		await page.goto(`chrome-extension://${extensionId}${shot.route}`);
		for (const [index, step] of [...(config.beforeEach ?? []), ...(shot.actions ?? [])].entries()) {
			try {
				await act(page, step);
			} catch (error) {
				console.error(await page.locator('body').innerText());
				throw new Error(
					`Action ${index + 1} (${typeof step === 'string' ? step : step.action}): ${error.message}`
				);
			}
		}
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		if (unexpected.size) throw new Error('Screenshot encountered unmocked requests.');
		const screenshotDir =
			shot.outputDir === undefined ? outputDir : path.resolve(configDir, shot.outputDir);
		await mkdir(screenshotDir, { recursive: true });
		const outputPath = path.join(screenshotDir, `${shot.name}.webp`);
		const capture = shot.capture ?? {};
		if (capture.target && (capture.clip || capture.fullPage))
			throw new Error('Element capture cannot use clip or fullPage.');
		if (capture.clip && capture.fullPage) throw new Error('Choose clip or fullPage, not both.');
		const options = { type: 'png', animations: 'disabled' };
		const screenshot = capture.target
			? await target(page, capture.target).screenshot(options)
			: await page.screenshot({
					...options,
					fullPage: capture.fullPage ?? false,
					clip: capture.clip
				});
		await sharp(screenshot).webp({ lossless: true }).toFile(outputPath);
		console.log(`Screenshot saved to ${outputPath}`);
	} catch (error) {
		throw new Error(
			`${shot.name}: ${error.message}${unexpected.size ? `\nMissing mock responses: ${[...unexpected].join(', ')}` : ''}`,
			{ cause: error }
		);
	} finally {
		await context.close();
	}
}
