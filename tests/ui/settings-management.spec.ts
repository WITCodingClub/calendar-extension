import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport } from './helpers';
import { origin } from './backend';

test('Settings starts Google account connection without an email', async ({ extension }) => {
	const { page, context } = extension;
	const endpoint = `${origin}/api/user/google_calendar`;
	await context.route(endpoint, async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		await route.fulfill({ json: { error: 'Google connection is temporarily unavailable' } });
	});
	await extension.open();
	await chooseRadio(page, 'Settings');
	await expect(page.getByLabel('Google account email')).toHaveCount(0);
	const request = page.waitForRequest(
		(request) => request.url() === endpoint && request.method() === 'POST'
	);
	await page.getByRole('button', { name: 'Add Account', exact: true }).click();
	expect((await request).postDataJSON()).toEqual({});
	await expect(page.getByText('Google connection is temporarily unavailable')).toBeVisible();
});

test('Settings loads and scrolls every section without changing values', async ({ extension }) => {
	const { page, network } = extension;
	await extension.open();
	await chooseRadio(page, 'Settings');
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	await expect
		.poll(() => network.some((row) => row.path === '/api/calendar_preferences'))
		.toBe(true);
	const values = () =>
		page.locator('input, select, textarea').evaluateAll((elements) =>
			elements.map((element) => {
				const input = element as HTMLInputElement;
				return { value: input.value, checked: input.checked, disabled: input.disabled };
			})
		);
	const before = await values();
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const heading of await page.getByRole('heading').all())
			await heading.scrollIntoViewIfNeeded();
		await fitsViewport(page);
		await expect.poll(values).toEqual(before);
	}
	expect(
		network.every((row) => row.method === 'GET' || /meeting_times\/preferences/.test(row.path))
	).toBe(true);
});

test('Manage friends People/Groups/Requests and safe forms/routes without relationship changes', async ({
	extension
}) => {
	const { page } = extension;
	await extension.open();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	for (const name of ['Ada Test', 'Ben Test', 'Cam Test']) {
		await drawer.getByText(name, { exact: true }).click();
		await expect(drawer.getByRole('heading', { name, exact: true })).toBeVisible();
		await expect(drawer.getByRole('button', { name: 'Remove friend' })).toBeVisible();
		await drawer.getByRole('button', { name: 'All people' }).click();
	}
	await drawer.getByLabel('Search friends').fill('Ada');
	await expect(drawer.getByText('Ben Test', { exact: true })).toHaveCount(0);
	await drawer.getByLabel('Search friends').fill('');
	await drawer.getByRole('button', { name: 'Add friend', exact: true }).click();
	await expect(drawer.getByRole('button', { name: 'Send request' })).toBeDisabled();
	await drawer.getByLabel('Email or user ID').fill('someone@example.invalid');
	await expect(drawer.getByRole('button', { name: 'Send request' })).toBeEnabled();
	await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
	await chooseRadio(drawer, 'Groups');
	await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
	await drawer.getByLabel('Group name').fill('Unsaved group');
	await drawer.getByLabel('Search members').fill('Ben');
	await expect(drawer.getByRole('checkbox', { name: 'Ben Test' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Save group' })).toBeEnabled();
	await drawer.getByRole('button', { name: 'All groups' }).click();
	await expect(drawer.getByText('Unsaved group', { exact: true })).toHaveCount(0);
	await chooseRadio(drawer, /^Requests/);
	await expect(drawer.getByRole('heading', { name: 'Incoming Test' })).toBeVisible();
	await expect(drawer.getByText('Outgoing Test', { exact: true })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Decline', exact: true })).toBeVisible();
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, drawer);
	}
	await chooseRadio(drawer, 'People');
	await drawer.getByLabel('Search friends').fill('');
	await drawer.getByText('Ada Test', { exact: true }).click();
	await drawer.getByRole('button', { name: 'Find a time together' }).click();
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
	await expect(drawer).toBeHidden();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	await drawer.getByRole('button', { name: 'All people' }).click();
	await drawer.getByText('Ben Test', { exact: true }).click();
	await drawer.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Exit comparison' })).toBeVisible();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	await drawer.press('Escape');
	await expect(drawer).toBeHidden();
});
