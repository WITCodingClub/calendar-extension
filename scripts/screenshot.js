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
		if (shot.sidebar) {
			await page.addInitScript(() => {
				chrome.tabs.getCurrent = async () => undefined;
			});
		}
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
		await page.evaluate(() => {
			for (const animation of document.getAnimations()) {
				if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
			}
		});
		if (unexpected.size) throw new Error('Screenshot encountered unmocked requests.');
		const capture = shot.capture ?? {};
		if (capture.target) await target(page, capture.target).scrollIntoViewIfNeeded();
		if (shot.highlights !== undefined && !Array.isArray(shot.highlights))
			throw new Error('Highlights must be an array.');
		for (const highlight of shot.highlights ?? []) {
			const padding = highlight.padding ?? 6;
			const shape = highlight.shape ?? 'box';
			if (!['box', 'rounded'].includes(shape))
				throw new Error('Highlight shape must be box or rounded.');
			if (!Number.isFinite(padding) || padding < 0)
				throw new Error('Highlight padding must be a finite, non-negative pixel value.');
			const element = target(page, highlight.target);
			await element.waitFor({ state: 'visible' });
			await element.evaluate(
				(element, { padding, shape }) => {
					if (shape === 'rounded') {
						element.style.setProperty('outline', '3px solid #ff0000', 'important');
						element.style.setProperty('outline-offset', `${padding}px`, 'important');
						return;
					}
					const box = element.getBoundingClientRect();
					const dialog = element.closest('dialog[open]');
					const parent = dialog ?? document.documentElement;
					const parentBox = dialog?.getBoundingClientRect();
					const offsetX = dialog
						? dialog.scrollLeft - parentBox.left - dialog.clientLeft
						: window.scrollX;
					const offsetY = dialog
						? dialog.scrollTop - parentBox.top - dialog.clientTop
						: window.scrollY;
					const overlay = document.createElement('div');
					Object.assign(overlay.style, {
						position: 'absolute',
						left: `${box.left + offsetX - padding - 3}px`,
						top: `${box.top + offsetY - padding - 3}px`,
						width: `${box.width + 2 * (padding + 3)}px`,
						height: `${box.height + 2 * (padding + 3)}px`,
						border: '3px solid #ff0000',
						borderRadius: '0',
						boxSizing: 'border-box',
						pointerEvents: 'none',
						zIndex: '2147483647'
					});
					parent.append(overlay);
				},
				{ padding, shape }
			);
		}
		const screenshotDir =
			shot.outputDir === undefined ? outputDir : path.resolve(configDir, shot.outputDir);
		await mkdir(screenshotDir, { recursive: true });
		const outputPath = path.join(screenshotDir, `${shot.name}.webp`);
		if (capture.target && (capture.clip || capture.fullPage))
			throw new Error('Element capture cannot use clip or fullPage.');
		if (capture.clip && capture.fullPage) throw new Error('Choose clip or fullPage, not both.');
		if (capture.padding !== undefined && !capture.target)
			throw new Error('Capture padding requires a target.');
		const options = { type: 'png', animations: 'disabled' };
		let screenshot;
		if (capture.padding !== undefined) {
			const padding = Object.fromEntries(
				['top', 'right', 'bottom', 'left'].map((side) => [
					side,
					typeof capture.padding === 'number' ? capture.padding : (capture.padding?.[side] ?? 0)
				])
			);
			if (
				(capture.padding === null || typeof capture.padding !== 'object') &&
				typeof capture.padding !== 'number'
			)
				throw new Error('Capture padding must be a number or an object with side values.');
			if (Object.values(padding).some((value) => !Number.isFinite(value) || value < 0))
				throw new Error('Capture padding must contain finite, non-negative pixel values.');
			const element = target(page, capture.target);
			await element.scrollIntoViewIfNeeded();
			const clip = await element.evaluate((element, padding) => {
				const box = element.getBoundingClientRect();
				const pageWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
				const pageHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
				const x = Math.max(0, Math.floor(box.left + window.scrollX - padding.left));
				const y = Math.max(0, Math.floor(box.top + window.scrollY - padding.top));
				return {
					x,
					y,
					width: Math.min(pageWidth, Math.ceil(box.right + window.scrollX + padding.right)) - x,
					height: Math.min(pageHeight, Math.ceil(box.bottom + window.scrollY + padding.bottom)) - y
				};
			}, padding);
			screenshot = await page.screenshot({ ...options, clip });
		} else
			screenshot = capture.target
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
