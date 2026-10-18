import { test, expect } from './extension.fixture';
import { chooseRadio } from './helpers';

// Opt-in contract smoke. No synthetic routes, seeding or auth claim.
test('isolated staging session loads Calendar, Friends and Settings', async ({ extension }) => {
	await extension.open();
	const { page } = extension;
	await expect(page.getByRole('heading', { name: 'Your Calendar', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /\d{1,2}:\d{2}.* - / }).first()).toBeVisible();
	await chooseRadio(page, 'Friends');
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
	await page.getByRole('button', { name: /^People:/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await expect.poll(() => picker.getByRole('checkbox').count()).toBeGreaterThanOrEqual(4);
	await picker.getByRole('button', { name: 'Close', exact: true }).click();
	await chooseRadio(page, 'Settings');
	await expect(page.getByRole('heading', { name: 'Connected Google accounts' })).toBeVisible();
	await expect(
		page.getByText(`Signed in as ${process.env.WIT_LIVE_EXPECTED_EMAIL}`, { exact: true })
	).toBeVisible();
});
