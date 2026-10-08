import { test, expect } from './extension.fixture';
import { fitsViewport, chooseRadio } from './helpers';
import { now, origin, preference } from './backend';

test('two distinct event dialogs reuse loaded preferences; UI and startup request timings are separate', async ({
	extension
}) => {
	const { page, open, network } = extension;
	await open();
	await expect(page.getByRole('heading', { name: 'Your Calendar', exact: true })).toBeVisible();
	await expect
		.poll(
			() =>
				network.filter(
					(row) => row.path === '/api/meeting_times/preferences' && row.totalMs !== undefined
				).length
		)
		.toBe(1);
	for (const [index, title] of ['Algorithms Test', 'Systems Test'].entries()) {
		const event = page.getByRole('button', { name: new RegExp(title) }).first();
		await expect(event).toBeVisible();
		// Browser click listener excludes locator auto-wait/tool latency; observer ends at ready DOM.
		await page.evaluate(() => {
			const state = window as typeof window & { uiTiming?: { start?: number; end?: number } };
			state.uiTiming = {};
			document.addEventListener(
				'click',
				() => {
					state.uiTiming!.start = performance.now();
				},
				{ once: true, capture: true }
			);
			const observer = new MutationObserver(() => {
				const dialog = document.querySelector(
					'[role="dialog"][aria-labelledby="edit-event-title"]'
				);
				if (
					dialog &&
					dialog.getBoundingClientRect().width > 0 &&
					dialog.textContent?.includes('Save changes')
				) {
					state.uiTiming!.end = performance.now();
					observer.disconnect();
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
		});
		await event.click();
		const dialog = page.getByRole('dialog', { name: 'Edit Calendar Event' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(title);
		await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as typeof window & { uiTiming?: { end?: number } }).uiTiming?.end
				)
			)
			.toBeTruthy();
		const timing = await page.evaluate(() => {
			const t = (window as typeof window & { uiTiming: { start: number; end: number } }).uiTiming;
			return t.end - t.start;
		});
		console.log(
			`Synthetic event ${index + 1} click-to-ready DOM: ${timing.toFixed(1)} ms (not a performance threshold)`
		);
		for (const width of [320, 480, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			await fitsViewport(page, dialog);
		}
		await dialog.getByRole('button', { name: index ? 'Cancel' : 'Close', exact: true }).click();
		await expect(dialog).toBeHidden();
	}
	expect(network.filter((row) => row.path === '/api/meeting_times/:event/preference')).toHaveLength(
		0
	);
	console.log('Synthetic request timings:', JSON.stringify(network));
});

test('five-minute version checks use batch versions and refresh without replacing a draft', async ({
	extension
}) => {
	const { page, context, open, network } = extension;
	let version = 'a'.repeat(64);
	let versionReads = 0;
	let batchReads = 0;
	await context.route(origin + '/api/user/preferences/version', async (route) => {
		versionReads += 1;
		await route.fulfill({ json: { version } });
	});
	await context.route(origin + '/api/meeting_times/preferences', async (route) => {
		batchReads += 1;
		const ids: string[] = route.request().postDataJSON().meeting_time_ids;
		const preferences = Object.fromEntries(
			ids.map((id) => {
				const result = preference(id);
				if (version.startsWith('b') && id === 'own-1') result.preview.title = 'Updated Algorithms';
				return [id, result];
			})
		);
		await route.fulfill({
			json: { preferences, missing: [], version: batchReads === 1 ? '0'.repeat(64) : version }
		});
	});
	await page.clock.install({ time: new Date(now) });
	await open();
	await expect.poll(() => batchReads).toBe(1);
	await page
		.getByRole('button', { name: /Algorithms Test/ })
		.first()
		.click();
	const dialog = page.getByRole('dialog', { name: 'Edit Calendar Event' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Manual', exact: true }).click();
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Algorithms Test');
	await page.clock.fastForward(4 * 60 * 1000);
	expect(versionReads).toBe(1);
	await page.clock.fastForward(60 * 1000);
	await expect.poll(() => versionReads).toBe(2);
	await expect.poll(() => batchReads).toBe(2);
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Algorithms Test');
	await page.clock.fastForward(5 * 60 * 1000);
	await expect.poll(() => versionReads).toBe(3);
	expect(batchReads).toBe(2);
	await dialog.getByLabel('Course Title', { exact: true }).fill('Unsaved title');
	version = 'b'.repeat(64);
	await page.clock.fastForward(5 * 60 * 1000);
	await expect(page.getByRole('button', { name: /Updated Algorithms/ }).first()).toBeVisible();
	expect(versionReads).toBe(4);
	expect(batchReads).toBe(3);
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Unsaved title');
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(dialog).toBeHidden();
	await page
		.getByRole('button', { name: /Updated Algorithms/ })
		.first()
		.click();
	await dialog.getByRole('button', { name: 'Manual', exact: true }).click();
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue(
		'Updated Algorithms'
	);
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await chooseRadio(page, 'Friends');
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
	await page.clock.fastForward(5 * 60 * 1000);
	await expect.poll(() => versionReads).toBe(5);
	await chooseRadio(page, 'Calendar');
	await expect(page.getByRole('button', { name: /Updated Algorithms/ }).first()).toBeVisible();
	expect(batchReads).toBe(3);
	expect(network.filter((row) => row.path === '/api/meeting_times/:event/preference')).toHaveLength(
		0
	);
});

test('batches without versions keep per-event reads and discard a late response for a different event', async ({
	extension
}) => {
	const { page, context, open } = extension;
	let versionReads = 0;
	let firstRead = false;
	let resolveFirst!: () => void;
	const held = new Promise<void>((resolve) => {
		resolveFirst = resolve;
	});
	await context.route(origin + '/api/user/preferences/version', async (route) => {
		versionReads += 1;
		await route.fulfill({ json: { version: 'a'.repeat(64) } });
	});
	await context.route(origin + '/api/meeting_times/preferences', async (route) => {
		const ids: string[] = route.request().postDataJSON().meeting_time_ids;
		await route.fulfill({
			json: { preferences: Object.fromEntries(ids.map((id) => [id, preference(id)])) }
		});
	});
	await context.route(origin + '/api/meeting_times/own-1/preference', async (route) => {
		firstRead = true;
		await held;
		await route.fulfill({ json: preference('own-1') });
	});
	await page.clock.install({ time: new Date(now) });
	await open();
	await page
		.getByRole('button', { name: /Algorithms Test/ })
		.first()
		.click();
	await expect.poll(() => firstRead).toBe(true);
	await page
		.getByRole('button', { name: /Systems Test/ })
		.first()
		.click();
	const dialog = page.getByRole('dialog', { name: 'Edit Calendar Event' });
	await dialog.getByRole('button', { name: 'Manual', exact: true }).click();
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Systems Test');
	const completed = page.waitForResponse((response) =>
		response.url().endsWith('/own-1/preference')
	);
	resolveFirst();
	await completed;
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Systems Test');
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.clock.fastForward(10 * 60 * 1000);
	await expect.poll(() => versionReads).toBe(2);
});

test('failed version and preference reads remain retryable at the next interval', async ({
	extension
}) => {
	const { page, context, open, network } = extension;
	let versionReads = 0;
	let batchReads = 0;
	await context.route(origin + '/api/meeting_times/preferences', async (route) => {
		batchReads += 1;
		if (batchReads === 2) {
			await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
			return;
		}
		const ids: string[] = route.request().postDataJSON().meeting_time_ids;
		const preferences = Object.fromEntries(
			ids.map((id) => {
				const result = preference(id);
				if (id === 'own-1')
					result.preview.title = batchReads >= 3 ? 'Recovered Algorithms' : 'Loaded Algorithms';
				return [id, result];
			})
		);
		await route.fulfill({
			json: { preferences, missing: [], version: (batchReads >= 3 ? 'b' : 'a').repeat(64) }
		});
	});
	await context.route(origin + '/api/user/preferences/version', async (route) => {
		versionReads += 1;
		await route.fulfill(
			versionReads === 2
				? { status: 503, json: { error: 'Temporarily unavailable' } }
				: { json: { version: (versionReads >= 3 ? 'b' : 'a').repeat(64) } }
		);
	});
	await page.clock.install({ time: new Date(now) });
	await open();
	await expect(page.getByRole('button', { name: /Loaded Algorithms/ }).first()).toBeVisible();
	const failed = page.waitForResponse(
		(response) => response.url().endsWith('/user/preferences/version') && response.status() === 503
	);
	await page.clock.fastForward(5 * 60 * 1000);
	await failed;
	await page
		.getByRole('button', { name: /Loaded Algorithms/ })
		.first()
		.click();
	const dialog = page.getByRole('dialog', { name: 'Edit Calendar Event' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(batchReads).toBe(1);
	expect(network.filter((row) => row.path === '/api/meeting_times/:event/preference')).toHaveLength(
		0
	);
	const failedRefresh = page.waitForResponse(
		(response) => response.url().endsWith('/meeting_times/preferences') && response.status() === 503
	);
	await page.clock.fastForward(5 * 60 * 1000);
	await failedRefresh;
	expect(versionReads).toBe(3);
	expect(batchReads).toBe(2);
	expect(network.filter((row) => row.path === '/api/meeting_times/:event/preference')).toHaveLength(
		0
	);
	await page.clock.fastForward(5 * 60 * 1000);
	await expect(page.getByRole('button', { name: /Recovered Algorithms/ }).first()).toBeVisible();
	expect(versionReads).toBe(4);
	expect(batchReads).toBe(3);
});

test('a saved event immediately reuses the server-confirmed preferences', async ({ extension }) => {
	const { page, context, open, network } = extension;
	let submittedTitle: string | undefined;
	await context.route(origin + '/api/meeting_times/own-1/preference', async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		submittedTitle = route.request().postDataJSON().event_preference.title_template;
		const saved = preference('own-1');
		saved.resolved.title_template = 'Confirmed title';
		saved.preview.title = 'Confirmed title';
		await route.fulfill({ json: saved });
	});
	await open();
	await expect
		.poll(
			() =>
				network.filter(
					(row) => row.path === '/api/meeting_times/preferences' && row.totalMs !== undefined
				).length
		)
		.toBe(1);
	await page
		.getByRole('button', { name: /Algorithms Test/ })
		.first()
		.click();
	const dialog = page.getByRole('dialog', { name: 'Edit Calendar Event' });
	await dialog.getByRole('button', { name: 'Manual', exact: true }).click();
	await dialog.getByLabel('Course Title', { exact: true }).fill('Submitted title');
	await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(dialog).toBeHidden();
	expect(submittedTitle).toBe('Submitted title');
	await page
		.getByRole('button', { name: /Confirmed title/ })
		.first()
		.click();
	await dialog.getByRole('button', { name: 'Manual', exact: true }).click();
	await expect(dialog.getByLabel('Course Title', { exact: true })).toHaveValue('Confirmed title');
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(network.filter((row) => row.path === '/api/meeting_times/:event/preference')).toHaveLength(
		0
	);
});
