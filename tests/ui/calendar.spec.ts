import { test, expect } from './extension.fixture';
import { fitsViewport } from './helpers';

test('two distinct event dialogs: UI readiness and request timings are separate', async ({
	extension
}) => {
	const { page, open, network } = extension;
	await open();
	await expect(page.getByRole('heading', { name: 'Your Calendar', exact: true })).toBeVisible();
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
		const response = page.waitForResponse((r) =>
			r.url().includes(`/meeting_times/own-${index + 1}/preference`)
		);
		await event.click();
		await response;
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
		2
	);
	console.log('Synthetic request timings:', JSON.stringify(network));
});
