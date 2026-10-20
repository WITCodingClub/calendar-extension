import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport } from './helpers';
import { origin } from './backend';

test('Settings starts Google account connection without an email', async ({ extension }) => {
	const { page, context, network, worker } = extension;
	const endpoint = `${origin}/api/user/google_calendar`;
	await context.route(endpoint, async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		await route.fulfill({ json: { error: 'Google connection is temporarily unavailable' } });
	});
	await extension.open('settings');
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	const loaded = network.filter((row) => row.path === '/api/user/extension_config').length;
	await worker.evaluate(async () => {
		const { environment_data: data } = await chrome.storage.local.get('environment_data');
		data.jwt_tokens.staging += '-changed';
		await chrome.storage.local.set({ environment_data: data });
	});
	await expect
		.poll(() => network.filter((row) => row.path === '/api/user/extension_config').length)
		.toBeGreaterThan(loaded);
	await expect(page).toHaveURL(/\/settings(?:\.html)?$/);
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Manage friends', exact: true })).toHaveCount(0);
	expect(
		network.some((row) =>
			/catalog\/terms|processed_events|friends|preferences\/version/.test(row.path)
		)
	).toBe(false);
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
	await extension.open('help');
	await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
	await page.goto(extension.baseUrl + '/calendar.html?view=help');
	await expect(page).toHaveURL(/\/help(?:\.html)?$/);
	await expect(page.getByRole('heading', { name: 'Import ICS calendar' })).toBeVisible();
	await page.goto(extension.baseUrl + '/calendar.html?view=settings');
	await expect(page).toHaveURL(/\/settings(?:\.html)?$/);
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	await page.evaluate(() => sessionStorage.setItem('returnToSettings', 'true'));
	await page.goto(extension.baseUrl + '/calendar.html');
	await expect(page).toHaveURL(/\/settings(?:\.html)?$/);
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Manage friends', exact: true })).toHaveCount(0);
	expect(
		network.some((row) =>
			/catalog\/terms|processed_events|friends|preferences\/version/.test(row.path)
		)
	).toBe(false);
	await page.evaluate(() => {
		const startViewTransition = document.startViewTransition;
		document.startViewTransition = (update) => {
			document.startViewTransition = startViewTransition;
			const transition = startViewTransition.call(document, update);
			transition.skipTransition();
			return transition;
		};
	});
	await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
	await page
		.getByRole('navigation', { name: 'Application navigation' })
		.getByRole('button', { name: 'Calendar', exact: true })
		.click();
	const navigation = page.getByRole('navigation', { name: 'Application navigation' });
	const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
	await expect(page.getByRole('radio', { name: 'Settings', exact: true })).toHaveCount(0);
	await expect(page.getByRole('radio', { name: 'Help', exact: true })).toHaveCount(0);
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await openNavigation.click();
		await fitsViewport(page, navigation);
		await expect(navigation.getByRole('button')).toHaveText(['Calendar', 'Settings', 'Help']);
		await expect(navigation.locator('[aria-current="true"]')).toHaveText('Calendar');
		await page.keyboard.press('Escape');
		await expect(navigation).toBeHidden();
		await expect(openNavigation).toBeFocused();
	}
	await openNavigation.click();
	await navigation.getByRole('button', { name: 'Help', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
	await expect(page).toHaveURL(/\/help(?:\.html)?$/);
	await expect(navigation).toBeHidden();
	await openNavigation.click();
	await expect(navigation.locator('[aria-current="page"]')).toHaveText('Help');
	await navigation.getByRole('button', { name: 'Calendar', exact: true }).click();
	await chooseRadio(page, 'Friends');
	await openNavigation.click();
	await expect(navigation.locator('[aria-current="true"]')).toHaveText('Calendar');
	await page.setViewportSize({ width: 320, height: 900 });
	await fitsViewport(page, navigation);
	await navigation.getByRole('button', { name: 'Calendar', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Your Calendar', exact: true })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Calendar', exact: true })).toBeChecked();
	await chooseRadio(page, 'Friends');
	await openNavigation.click();
	await navigation.getByRole('button', { name: 'Settings', exact: true }).click();
	await expect(page).toHaveURL(/\/settings(?:\.html)?$/);
	await expect(navigation).toBeHidden();
	await openNavigation.click();
	await expect(navigation.locator('[aria-current="page"]')).toHaveText('Settings');
	await page.keyboard.press('Escape');
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
	await drawer.getByLabel('Search people').fill('Ada');
	await expect(drawer.getByText('Ben Test', { exact: true })).toHaveCount(0);
	await drawer.getByLabel('Search people').fill('');
	await drawer.getByRole('button', { name: 'Add friend', exact: true }).click();
	await expect(drawer.getByRole('button', { name: 'Send request' })).toBeDisabled();
	await drawer.getByLabel('Email or user ID').fill('someone@example.invalid');
	await expect(drawer.getByRole('button', { name: 'Send request' })).toBeEnabled();
	await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
	await chooseRadio(drawer, 'Groups');
	await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
	await drawer.getByLabel('Group name').fill('Unsaved group');
	await drawer.getByLabel('Search friends to add').fill('Ben');
	await expect(drawer.getByRole('checkbox', { name: 'Ben Test' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Save group' })).toBeEnabled();
	await drawer.getByRole('button', { name: 'All groups' }).click();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await expect(drawer.getByText('Unsaved group', { exact: true })).toHaveCount(0);
	await chooseRadio(drawer, /^Requests/);
	await expect(drawer.getByRole('heading', { name: 'Incoming Test' })).toBeVisible();
	await expect(drawer.getByText('Outgoing Test', { exact: true })).toBeVisible();
	await expect(
		drawer.getByRole('button', { name: 'Accept friend request from Incoming Test', exact: true })
	).toBeVisible();
	await expect(
		drawer.getByRole('button', { name: 'Decline friend request from Incoming Test', exact: true })
	).toBeVisible();
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, drawer);
	}
	await chooseRadio(drawer, 'People');
	await drawer.getByLabel('Search people').fill('');
	await drawer.getByText('Ada Test', { exact: true }).click();
	await drawer.getByRole('button', { name: 'Find a time together' }).click();
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
	await expect(drawer).toBeHidden();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	await drawer.getByRole('button', { name: 'All people' }).click();
	await drawer.getByText('Ben Test', { exact: true }).click();
	await drawer.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await expect(page.getByRole('button', { name: '← Back to Friends' })).toBeVisible();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	await drawer.press('Escape');
	await expect(drawer).toBeHidden();
});
