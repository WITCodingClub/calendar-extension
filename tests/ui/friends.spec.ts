import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport, selectFriends, toggle } from './helpers';
import { friends, origin } from './backend';

test('picker, planning preferences, meeting validation, draft, preview and link form', async ({
	extension
}) => {
	const { page } = extension;
	await extension.open();
	await selectFriends(page);
	const preferences = page.getByRole('region', { name: 'Meeting preferences' });
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, preferences);
	}
	await preferences.getByLabel('From', { exact: true }).fill('2026-10-07');
	await preferences.getByLabel('Until', { exact: true }).fill('2026-10-06');
	await expect(page.getByText('Choose a valid date range.', { exact: true })).toBeVisible();
	await preferences.getByLabel('Until', { exact: true }).fill('2026-10-23');
	await preferences.getByLabel('Duration (minutes)', { exact: true }).fill('0');
	await expect(
		page.getByText('Enter a positive duration and a buffer of zero or more minutes.', {
			exact: true
		})
	).toBeVisible();
	await preferences.getByLabel('Duration (minutes)', { exact: true }).fill('45');
	await preferences.getByLabel('Daily start').fill('08:00');
	await preferences.getByLabel('Daily end').fill('18:00');
	await preferences.getByText('Additional options', { exact: true }).click();
	await preferences.getByLabel('Buffer (minutes)').fill('-1');
	await expect(
		page.getByText('Enter a positive duration and a buffer of zero or more minutes.', {
			exact: true
		})
	).toBeVisible();
	await preferences.getByLabel('Buffer (minutes)').fill('5');
	await toggle(preferences, 'Between classes', true);
	await expect(preferences.getByText(/Only gaps between/)).toBeVisible();
	await toggle(preferences, 'Between classes', false);
	await preferences.getByLabel('Daily end').fill('07:00');
	await expect(
		page.getByText('Choose a daily start before the daily end.', { exact: true })
	).toBeVisible();
	await preferences.getByLabel('Daily end').fill('18:00');
	const schedulesBefore = extension.network.filter((row) =>
		row.path.endsWith('/processed_events')
	).length;
	await page.getByRole('button', { name: 'Reload schedules', exact: true }).click();
	await expect
		.poll(() => extension.network.filter((row) => row.path.endsWith('/processed_events')).length)
		.toBe(schedulesBefore + 3);
	const results = page.getByRole('region', { name: 'Shared free periods' });
	await expect(results.locator('details')).toHaveCount(5);
	await results.locator('summary').first().click();
	await expect(results.locator('details').first()).not.toHaveAttribute('open');
	await results.locator('summary').first().click();
	await results.getByRole('button', { name: 'Show more days' }).click();
	await expect(results.locator('details')).toHaveCount(10);
	await results
		.getByRole('button', { name: /^08:00/ })
		.first()
		.click();
	const editor = page.getByRole('dialog', { name: 'Choose meeting time' });
	await expect(editor).toBeVisible();
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, editor);
	}
	await editor.getByLabel('Date', { exact: true }).fill('2026-10-08');
	await editor.getByLabel('Date', { exact: true }).fill('2026-10-07');
	await editor.getByLabel('Duration (min)', { exact: true }).fill('30');
	const slider = editor.getByRole('slider', { name: 'Meeting start time' });
	await slider.focus();
	await slider.press('ArrowRight');
	await expect(editor.getByLabel('Start', { exact: true })).toHaveValue('08:01');
	await editor.getByLabel('End', { exact: true }).fill('07:00');
	await expect(editor.getByRole('button', { name: 'Continue' })).toBeDisabled();
	await expect(editor.getByRole('status')).toContainText(/end|after|valid/i);
	await editor.getByLabel('Start', { exact: true }).fill('08:00');
	await editor.getByLabel('End', { exact: true }).fill('08:30');
	await editor.getByRole('button', { name: 'Continue' }).click();
	const details = page.getByRole('dialog', { name: 'Edit / confirm meeting' });
	await details.getByLabel('Title', { exact: true }).fill('Test planning draft');
	await details.getByLabel('Location (optional)').fill('Test Hall');
	await expect(details.getByLabel('Destination calendar')).toBeDisabled();
	await expect(
		details.getByRole('checkbox', { name: 'Send invitations when supported' })
	).toBeDisabled();
	await expect(details.getByRole('button', { name: 'Create meeting', exact: true })).toBeDisabled();
	await details.getByRole('button', { name: 'Change time' }).click();
	await editor.getByRole('button', { name: 'Continue' }).click();
	await expect(details.getByLabel('Title', { exact: true })).toHaveValue('Test planning draft');
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, details);
	}
	await details.getByRole('button', { name: 'Preview on calendar' }).click();
	await expect(page.getByRole('button', { name: /^Planned meeting,/ })).toBeVisible();
	await page.getByRole('button', { name: 'Next week', exact: true }).click();
	await expect(page.getByRole('button', { name: /^Planned meeting,/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'View meeting week' }).click();
	await expect(page.getByRole('button', { name: /^Planned meeting,/ })).toBeVisible();
	await page.getByRole('button', { name: 'Edit / confirm', exact: true }).click();
	await expect(details.getByLabel('Title', { exact: true })).toHaveValue('Test planning draft');
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Exit comparison' }).click();
	await chooseRadio(page, 'Friends');
	await page.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	const link = page.getByRole('dialog', { name: 'Create meeting link' });
	await link.getByLabel('Meeting name (optional)').fill('Test link draft');
	await link.getByLabel('Link expires').fill('2026-10-20');
	await expect(link.getByRole('button', { name: 'Generate link' })).toBeDisabled();
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, link);
	}
	await link.getByRole('button', { name: 'Close', exact: true }).click();
});

test('detailed/group comparison uses real selected schedules, details and week navigation', async ({
	extension
}) => {
	const { page } = extension;
	await extension.open();
	await selectFriends(page);
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await chooseRadio(page, 'Detailed');
	await expect(page.getByRole('button', { name: /Ada Test · Ada Class/ })).toHaveCount(5);
	await expect(page.getByRole('button', { name: /Ben Test · Ben Class/ })).toHaveCount(5);
	await expect(page.getByRole('button', { name: /Cam Test ·/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: /You · Algorithms Test/ })).toHaveCount(5);
	await page
		.getByRole('button', { name: /Ada Test · Ada Class/ })
		.first()
		.click();
	const friend = page.getByRole('dialog', { name: 'Ada Class' });
	await expect(friend.getByText('Ada Test', { exact: true })).toBeVisible();
	await friend.getByRole('button', { name: 'Close', exact: true }).click();
	await chooseRadio(page, 'Group availability');
	await expect(page.getByRole('button', { name: /Group · Busy/ })).toHaveCount(10);
	await page
		.getByRole('button', { name: /Group · Busy/ })
		.first()
		.click();
	const group = page.getByRole('dialog', { name: 'Group availability' });
	await expect(group).toContainText('Ada Test · Ada Class');
	await expect(group).toContainText('Ben Test · Ben Class');
	await group.getByRole('button', { name: 'Close', exact: true }).click();
	const week = page.getByText(/^Week of /);
	const initial = await week.textContent();
	await page.getByRole('button', { name: 'Previous week' }).click();
	await expect(week).not.toHaveText(initial!);
	await page.getByRole('button', { name: 'Next week' }).click();
	await expect(week).toHaveText(initial!);
	await page.getByRole('button', { name: 'Next week' }).click();
	await expect(week).not.toHaveText(initial!);
	await page.getByRole('button', { name: 'This week' }).click();
	await expect(week).toHaveText(initial!);
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page);
	}
	await page.getByRole('button', { name: 'Exit comparison' }).click();
	await expect(page.getByRole('radio', { name: 'Detailed', exact: true })).toHaveCount(0);
	await extension.context.route(origin + '/api/friends', async (route) =>
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
	const detailsBefore = extension.network.filter(
		(row) => row.path.endsWith('/processed_events') || row.path.endsWith('/is_processed')
	).length;
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	await expect(drawer.getByText('Availability only', { exact: true }).first()).toBeVisible();
	await drawer.getByRole('button', { name: 'Close manage friends', exact: true }).click();
	await chooseRadio(page, 'Friends');
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await chooseRadio(page, 'Detailed');
	await expect(page.getByRole('button', { name: /Ada Test · Busy/ })).toHaveCount(5);
	await expect(page.getByRole('button', { name: /Ada Class/ })).toHaveCount(0);
	expect(
		extension.network.filter(
			(row) => row.path.endsWith('/processed_events') || row.path.endsWith('/is_processed')
		)
	).toHaveLength(detailsBefore);
	await page.getByRole('button', { name: 'Exit comparison' }).click();
	await chooseRadio(page, 'Friends');
	await page.getByText('Additional options', { exact: true }).click();
	await expect(page.getByRole('switch', { name: 'Between classes' })).toBeDisabled();
	await expect(
		page.getByText('Between classes needs full class details for every selected participant.', {
			exact: true
		})
	).toBeVisible();
});
