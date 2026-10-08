import { test, expect } from './extension.fixture';
import { origin, now } from './backend';
import { fitsViewport, selectFriends } from './helpers';

test('meeting links recover from rejection, keep their URL during creation and update without reloads', async ({
	extension
}) => {
	const { page, context, network } = extension;
	let attempts = 0;
	let submitted: Record<string, unknown> | undefined;
	let finishCreation!: () => void;
	const creation = new Promise<void>((resolve) => (finishCreation = resolve));
	const link = {
		id: 'mlk_synthetic',
		title: 'Project check-in',
		starts_on: '2026-10-07',
		ends_on: '2026-10-09',
		duration_minutes: 30,
		expires_at: '2026-10-14T03:59:59Z',
		status: 'active',
		created_at: now,
		booking: null
	};
	await context.route(`${origin}/api/meeting_links`, async (route) => {
		if (route.request().method() !== 'POST') return route.fallback();
		attempts++;
		submitted = route.request().postDataJSON();
		if (attempts === 1)
			return route.fulfill({ status: 422, json: { error: 'Synthetic validation rejection' } });
		await creation;
		await route.fulfill({
			status: 201,
			json: { meeting_link: { ...link, url: 'https://example.invalid/meet/synthetic' } }
		});
	});
	await context.route(`${origin}/api/meeting_links/${link.id}`, async (route) => {
		if (route.request().method() !== 'DELETE') return route.fallback();
		await route.fulfill({ json: { meeting_link: { ...link, status: 'revoked' } } });
	});
	await extension.open();
	await selectFriends(page);
	await page
		.getByRole('region', { name: 'Meeting preferences' })
		.getByLabel('Duration (minutes)')
		.fill('75');
	await page.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Create meeting link' });
	await expect(dialog.getByLabel('Duration', { exact: true })).toHaveValue('30');
	await expect(page.getByRole('region', { name: 'One-time meeting links' })).toContainText(
		/isn.t your friend/
	);
	await dialog.getByLabel('Meeting name (optional)').fill(link.title);
	await dialog.getByLabel('From', { exact: true }).fill(link.starts_on);
	await dialog.getByLabel('Until', { exact: true }).fill(link.ends_on);
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, dialog);
		const duration = dialog.getByLabel('Duration', { exact: true });
		await duration.click();
		await expect
			.poll(() =>
				duration.evaluate(
					(element) =>
						Number.parseFloat(getComputedStyle(element, '::picker(select)').width) <=
						element.getBoundingClientRect().width + 1
				)
			)
			.toBe(true);
		await duration.press('Escape');
	}
	await dialog.getByRole('button', { name: 'Generate link', exact: true }).click();
	await expect(dialog.getByRole('alert')).toContainText('Synthetic validation rejection');
	await expect(dialog.getByLabel('Meeting name (optional)')).toBeEnabled();
	await expect(dialog.getByRole('button', { name: 'Generate link', exact: true })).toBeEnabled();
	try {
		await dialog.getByRole('button', { name: 'Generate link', exact: true }).click();
		await expect.poll(() => attempts).toBe(2);
		await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
		await dialog.press('Escape');
		await expect(dialog).toBeVisible();
	} finally {
		finishCreation();
	}
	await expect(
		dialog.getByText('https://example.invalid/meet/synthetic', { exact: true })
	).toBeVisible();
	expect(submitted).toMatchObject({ title: link.title, duration_minutes: 30 });
	await dialog.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(page.getByText(`${link.title} · active`, { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Revoke link', exact: true }).click();
	await expect(page.getByText(`${link.title} · revoked`, { exact: true })).toBeVisible();
	expect(network.filter((row) => row.path === '/api/meeting_links')).toHaveLength(1);
});

test('expiry updates and management reloads preserve selected schedule caches', async ({
	extension
}) => {
	const { page, context, network } = extension;
	await context.route(`${origin}/api/friends/friend-ada/expiry`, async (route) => {
		if (route.request().method() !== 'PATCH') return route.fallback();
		await route.fulfill({
			json: {
				friendship_id: 'frn_synthetic',
				status: 'accepted',
				expires_at: route.request().postDataJSON().expires_at,
				friend: { id: 'friend-ada', name: 'Ada Test' }
			}
		});
	});
	await extension.open();
	await selectFriends(page);
	const schedulesBefore = network.filter((row) => row.path.endsWith('/processed_events')).length;
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	await expect(drawer.getByText('Ada Test', { exact: true })).toBeVisible();
	await drawer.getByText('Ada Test', { exact: true }).click();
	await drawer.getByLabel('Friendship expires (optional)').fill('2026-10-16');
	const readsBefore = network.filter(
		(row) => row.path === '/api/friends' || row.path === '/api/friends/requests'
	).length;
	await drawer.getByRole('button', { name: 'Save expiry', exact: true }).click();
	await expect(drawer.getByRole('button', { name: 'Save expiry', exact: true })).toBeEnabled();
	await drawer.getByRole('button', { name: 'All people', exact: true }).click();
	await expect(drawer.getByText(/Expires/).first()).toBeVisible();
	await drawer.getByRole('button', { name: 'Close manage friends', exact: true }).click();
	await expect(
		page.getByRole('region', { name: 'Shared free periods' }).getByRole('button').first()
	).toBeVisible();
	expect(network.filter((row) => row.path.endsWith('/processed_events'))).toHaveLength(
		schedulesBefore
	);
	expect(
		network.filter((row) => row.path === '/api/friends' || row.path === '/api/friends/requests')
	).toHaveLength(readsBefore);
});
