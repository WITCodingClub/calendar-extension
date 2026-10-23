import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport, selectFriends } from './helpers';
import { friends, origin } from './backend';

test('approved planner, explicit draft, duration and preview retain session context', async ({
	extension
}) => {
	const { page } = extension;
	await extension.open();
	await selectFriends(page, true);
	const planner = page.getByRole('region', { name: 'Friends planning' });
	const suggested = planner.locator('.day');
	await expect(suggested).toHaveCount(3);
	await planner.getByRole('button', { name: 'Show more suggested days' }).click();
	await expect(suggested).toHaveCount(4);
	await planner.getByRole('button', { name: /Tuesday, Oct 6, 12:15 to 12:45/ }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting', exact: true });
	await expect(editor).toBeVisible();
	await expect(planner.getByText('Saved draft', { exact: true })).toHaveCount(0);
	await editor.getByLabel('Meeting title').fill('Planning draft');
	await editor.getByText('More options', { exact: true }).click();
	await editor.getByLabel('Location (optional)').fill('Test Hall');
	await expect(editor.getByRole('checkbox')).toBeChecked();
	await editor.getByLabel('Duration', { exact: true }).selectOption('45');
	await expect(editor.getByText('Ends at 13:00')).toBeVisible();
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, editor);
		await expect(editor.getByRole('button', { name: 'Save draft' })).toBeInViewport();
	}
	await editor.getByRole('button', { name: 'Save draft' }).click();
	await expect(planner.getByText('Planning draft', { exact: true })).toBeVisible();
	await planner.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(editor.getByLabel('Meeting title')).toHaveValue('Planning draft');
	await editor.getByLabel('Meeting title').fill('Unsaved revision');
	await editor.getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(planner.getByText('Planning draft', { exact: true })).toBeVisible();
	await expect(planner.getByText('Unsaved revision', { exact: true })).toHaveCount(0);
	await planner.getByRole('button', { name: /Wednesday, Oct 7, 11:45 to 12:15/ }).click();
	await expect(editor.getByLabel('Meeting title')).toHaveValue('Planning draft');
	await editor.getByRole('button', { name: 'Preview on calendar' }).click();
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	await expect(comparison.getByRole('radio', { name: 'Detailed', exact: true })).toBeChecked();
	await expect(comparison.getByRole('radio', { name: 'List', exact: true })).toBeChecked();
	await expect(comparison.getByRole('button', { name: /Proposed meeting, Wednesday/ })).toHaveCount(
		1
	);
	await chooseRadio(comparison, 'Calendar');
	await chooseRadio(comparison, 'Group availability');
	await comparison.getByRole('button', { name: 'Back to editing' }).click();
	await expect(editor.getByLabel('Meeting title')).toHaveValue('Planning draft');
	await editor.getByRole('button', { name: 'Preview on calendar' }).click();
	await expect(comparison.getByRole('radio', { name: 'Detailed', exact: true })).toBeChecked();
	await expect(comparison.getByRole('radio', { name: 'List', exact: true })).toBeChecked();
	await chooseRadio(comparison, 'Calendar');
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await expect(planner.getByText('Planning draft', { exact: true })).toBeVisible();
	await expect(suggested).toHaveCount(4);
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await expect(comparison.getByRole('radio', { name: 'Calendar', exact: true })).toBeChecked();
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await planner.getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(planner.getByText('Saved draft', { exact: true })).toHaveCount(0);
});

test('filter validation, no-match feedback and real availability reload', async ({ extension }) => {
	const { page, network } = extension;
	await extension.open();
	await selectFriends(page);
	const planner = page.getByRole('region', { name: 'Friends planning' });
	await planner.getByRole('button', { name: 'This week', exact: true }).click();
	await planner
		.locator('.filter-menu')
		.getByRole('button', { name: 'Custom Date', exact: true })
		.click();
	await planner.getByLabel('From', { exact: true }).fill('2026-10-09');
	await planner.getByLabel('Until', { exact: true }).fill('2026-10-07');
	await expect(planner.getByText('Choose a start date on or before the end date.')).toBeVisible();
	await planner.getByLabel('From', { exact: true }).fill('2026-10-07');
	await planner.getByLabel('Until', { exact: true }).fill('2026-10-16');
	await planner.getByRole('button', { name: '30 min', exact: true }).click();
	await planner
		.locator('.filter-menu')
		.getByRole('button', { name: 'Custom Duration', exact: true })
		.click();
	await planner.getByLabel('Minutes', { exact: true }).fill('0');
	await expect(planner.getByText('Choose a meeting duration.')).toBeVisible();
	await planner.getByLabel('Minutes', { exact: true }).fill('30');
	await planner.getByRole('button', { name: '10 min buffer', exact: true }).click();
	await planner
		.locator('.filter-menu')
		.getByRole('button', { name: 'Custom Buffer', exact: true })
		.click();
	await planner.getByLabel('Buffer minutes').fill('-1');
	await expect(planner.getByText('Enter a buffer of zero or more minutes.')).toBeVisible();
	await planner.getByLabel('Buffer minutes').fill('10');
	const before = network.filter((row) => row.path.endsWith('/busy_blocks')).length;
	await page.getByRole('button', { name: 'Refresh friends', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Refresh friends', exact: true })).toBeEnabled();
	await expect
		.poll(() => network.filter((row) => row.path.endsWith('/busy_blocks')).length)
		.toBeGreaterThan(before);
	await expect(planner.locator('.day')).toHaveCount(3);
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, planner);
	}
	await page.getByRole('button', { name: /^Edit people/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await picker.getByLabel('Search people').fill('Nobody');
	await expect(picker.getByText('No people match “Nobody”.')).toBeVisible();
	await picker.getByRole('button', { name: 'Clear search' }).click();
	await expect(picker.getByRole('checkbox', { name: /Ada/ })).toBeChecked();
	await picker.getByRole('button', { name: 'Done', exact: true }).click();
});

test('comparison uses real schedules, owner strips, privacy, missing data and day/week navigation', async ({
	extension
}) => {
	const { page, context } = extension;
	await context.route(origin + '/api/friends', (route) =>
		route.fulfill({
			json: {
				friends: friends.map((friend) =>
					friend.id === 'friend-ada'
						? { ...friend, visibility: { mine: 'full', theirs: 'availability_only' } }
						: friend
				)
			}
		})
	);
	await extension.open();
	await selectFriends(page);
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	await chooseRadio(comparison, 'Calendar');
	await expect(comparison.getByRole('button', { name: /Ada Test · Busy/ })).toHaveCount(5);
	await expect(comparison.getByRole('button', { name: /Ada Class/ })).toHaveCount(0);
	await comparison
		.getByRole('button', { name: /Ada Test · Busy/ })
		.first()
		.click();
	const detail = page.getByRole('dialog', { name: 'Busy', exact: true });
	await expect(detail).toContainText('Event details are private.');
	await detail.getByRole('button', { name: 'Close', exact: true }).click();
	await chooseRadio(comparison, 'Group availability');
	await expect(comparison.locator('.owner-strips').first()).toBeVisible();
	await comparison
		.getByRole('button', { name: /Group · Busy/ })
		.first()
		.click();
	const group = page.getByRole('dialog', { name: 'Group busy time' });
	await expect(group).toContainText('Ada Test');
	await expect(group).toContainText('Busy · Availability only');
	await group.getByRole('button', { name: 'Close', exact: true }).click();
	await chooseRadio(comparison, 'List');
	await expect(
		comparison.getByRole('button', { name: 'Show Tuesday, Oct 6, 2026', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await comparison.getByRole('button', { name: 'Next week', exact: true }).click();
	await expect(
		comparison.getByRole('region', { name: 'Schedule list for Tuesday, Oct 13, 2026' })
	).toBeVisible();
	await comparison.getByRole('button', { name: 'This week', exact: true }).click();
	let fail = true;
	await context.route(origin + '/api/friends/friend-ben/busy_blocks?*', (route) =>
		fail
			? route.fulfill({ status: 503, json: { error: 'Ben availability unavailable' } })
			: route.fallback()
	);
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await page.getByRole('button', { name: 'Refresh friends', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Friends planning' })).toContainText(
		'Ben availability unavailable'
	);
	await expect(page.getByRole('region', { name: 'Friends planning' }).locator('.day')).toHaveCount(
		0
	);
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await expect(comparison.getByText('Ben Test - Could not load schedule')).toBeVisible();
	await expect(comparison.getByRole('button', { name: /Ben Test - Ben Class/ })).toHaveCount(0);
	fail = false;
	await comparison.getByRole('button', { name: 'Refresh', exact: true }).click();
	await chooseRadio(comparison, 'Detailed');
	await expect(comparison.getByRole('button', { name: /Ben Test - Ben Class/ })).toBeVisible();
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, comparison);
	}
});

test('global refresh retries Upcoming and reloads Friends resources without losing preferences', async ({
	extension
}) => {
	const { page, context, network } = extension;
	let fail = true,
		reads = 0;
	await context.route(origin + '/api/friends/meetings?*', (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		reads++;
		return fail
			? route.fulfill({ status: 503, json: { error: 'Meetings unavailable' } })
			: route.fulfill({ json: { meetings: [], occurrences: [] } });
	});
	await extension.open();
	await selectFriends(page);
	const saved = page.getByRole('region', { name: 'Saved meetings', exact: true });
	await expect(saved.getByRole('alert')).toContainText('Meetings unavailable');
	const paths = [
		'/api/friends',
		'/api/friends/requests',
		'/api/friends/groups',
		'/api/meeting_links'
	];
	const before = paths.map((path) => network.filter((row) => row.path === path).length);
	const oldReads = reads;
	fail = false;
	const refresh = page.getByRole('button', { name: 'Refresh friends', exact: true });
	await refresh.click();
	await expect(saved.getByText('No meetings in the next 14 days.')).toBeVisible();
	await expect(refresh).toBeEnabled();
	await expect(
		page.getByRole('button', { name: /^Edit people · You, Ada Test, Ben Test/ })
	).toBeVisible();
	await expect.poll(() => reads).toBeGreaterThan(oldReads);
	await expect
		.poll(() => paths.map((path) => network.filter((row) => row.path === path).length))
		.toEqual(before.map((count) => count + 1));
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await page.getByRole('button', { name: 'Next week', exact: true }).click();
	await page.getByRole('button', { name: '← Back to Friends' }).click();
	await expect(saved).toContainText('Oct 6, 2026 - Oct 19, 2026');
	await expect(saved.getByRole('button', { name: 'Previous week' })).toHaveCount(0);
});
