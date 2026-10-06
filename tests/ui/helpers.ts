import { expect, type Locator, type Page } from '@playwright/test';

// m3-svelte overlays intercept clicks on the input; operate its visible label.
export async function chooseRadio(scope: Page | Locator, name: string | RegExp) {
	const input = scope.getByRole('radio', { name, exact: typeof name === 'string' });
	const id = await input.getAttribute('id');
	if (!id) throw new Error(`Radio has no associated label: ${name}`);
	await scope.locator(`label[for="${id}"]`).click();
	await expect(input).toBeChecked();
}
export async function toggle(scope: Page | Locator, name: string | RegExp, checked: boolean) {
	const input = scope.getByRole('checkbox', { name }).or(scope.getByRole('switch', { name }));
	if ((await input.isChecked()) !== checked)
		await input.locator('xpath=ancestor::label[1]').click();
	await expect(input).toBeChecked({ checked });
}
export async function selectFriends(page: Page) {
	await chooseRadio(page, 'Friends');
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
	await page.getByRole('button', { name: /^People:/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await expect(picker.getByRole('checkbox', { name: /Ada Test/ })).toBeVisible();
	await picker.getByLabel('Search people').fill('no-match');
	await expect(picker.getByRole('checkbox')).toHaveCount(0);
	await picker.getByLabel('Search people').fill('Ada');
	await toggle(picker, /Ada Test/, true);
	await picker.getByLabel('Search people').fill('');
	await toggle(picker, /Ben Test/, true);
	await toggle(picker, /You/, false);
	await toggle(picker, /You/, true);
	await picker.getByRole('button', { name: 'Clear friends' }).click();
	await expect(picker.getByRole('checkbox', { name: /Ada Test/ })).not.toBeChecked();
	await toggle(picker, /Ada Test/, true);
	await toggle(picker, /Ben Test/, true);
	await picker.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'People: You + 2 friends', exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Shared free periods' }).getByRole('button').first()
	).toBeVisible();
}
export async function fitsViewport(page: Page, target?: Locator) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		.toBe(true);
	if (target) {
		await expect(target).toBeVisible();
		const bounds = await target.boundingBox();
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
		expect(await target.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
	}
}
