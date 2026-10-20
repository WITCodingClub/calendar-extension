import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport, selectFriends } from './helpers';
import { origin, ownCourses, settings } from './backend';

test('editor honors planning hours and comparison fits narrow and wide views', async ({
	extension
}) => {
	const { page } = extension;
	await extension.open();
	await selectFriends(page);
	const planner = page.getByRole('region', { name: 'Friends planning' });
	await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toHaveCount(1);
	await planner.getByRole('button', { name: /Wednesday, Oct 7, 11:45 to 12:15/ }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting', exact: true });
	await editor.getByLabel('Meeting title').fill('Filtered preview');
	const menu = editor.getByLabel('Start time');
	await expect(menu.locator('option:not(:disabled)')).not.toHaveCount(0);
	expect(
		await menu.locator('option:not(:disabled)').evaluateAll((options) =>
			options.every((option) => {
				const value = Number((option as HTMLOptionElement).value);
				return value >= 9 * 60 && value + 30 <= 17 * 60;
			})
		)
	).toBe(true);
	await page.setViewportSize({ width: 320, height: 900 });
	await menu.click();
	await menu.press('Escape');
	await menu.selectOption('990');
	await expect(menu).toHaveValue('990');
	await expect(editor.getByText('Ends at 17:00')).toBeVisible();
	await fitsViewport(page, editor);
	await editor.getByRole('button', { name: 'Save draft' }).click();
	await planner.getByRole('button', { name: '09:00 - 17:00', exact: true }).click();
	await planner
		.locator('.filter-menu')
		.getByRole('button', { name: 'Custom Time', exact: true })
		.click();
	await planner.getByLabel('Daily end').fill('16:00');
	await planner.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(editor.getByRole('alert')).toContainText('planning hours');
	await expect(editor.getByRole('button', { name: 'Preview on calendar' })).toBeDisabled();
	await editor.getByRole('button', { name: 'Discard', exact: true }).click();
	await planner.getByLabel('Daily end').fill('17:00');
	await planner.getByRole('button', { name: 'Continue', exact: true }).click();
	await editor.getByRole('button', { name: 'Preview on calendar' }).click();
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		for (const view of ['Calendar', 'List']) {
			await chooseRadio(comparison, view);
			if (view === 'List')
				await comparison
					.getByRole('button', { name: 'Show Wednesday, Oct 7, 2026', exact: true })
					.click();
			await fitsViewport(page, comparison);
			const bounds = await comparison.boundingBox();
			const parent = await comparison.locator('..').boundingBox();
			expect(bounds!.x).toBeCloseTo(parent!.x, 0);
			expect(bounds!.width).toBeCloseTo(parent!.width, 0);
		}
	}
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await planner.getByRole('button', { name: 'Discard', exact: true }).click();
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	for (const view of ['Calendar', 'List']) {
		await chooseRadio(comparison, view);
		const bounds = await comparison.boundingBox(),
			parent = await comparison.locator('..').boundingBox();
		expect(bounds!.width).toBeCloseTo(parent!.width, 0);
	}
});

test('historical terms support Calendar/List with a fixed sample week and weekday-only labels', async ({
	extension
}) => {
	const { page, context } = extension;
	const past = { id: '202510', name: 'Fall 2025' };
	await context.route(origin + '/api/user/extension_config', (route) =>
		route.fulfill({
			json: {
				...settings,
				show_historic_terms: true,
				enrolled_terms: [past, ...settings.enrolled_terms]
			}
		})
	);
	await context.route(origin + '/api/user/processed_events/status?term_uid=202510', (route) =>
		route.fulfill({ json: { processed: true } })
	);
	await context.route(origin + '/api/user/processed_events?term_uid=202510', (route) =>
		route.fulfill({
			json: {
				classes: ownCourses.map((course) => ({
					...course,
					term: { ...course.term, uid: 202510 },
					meeting_times: course.meeting_times.map((time) => ({
						...time,
						wednesday: false,
						start_date: '2025-09-01',
						end_date: '2025-12-20'
					}))
				}))
			}
		})
	);
	await extension.open();
	await chooseRadio(page, 'Fall 2025');
	await chooseRadio(page, 'List view');
	const day = page.getByRole('navigation', { name: 'Schedule day' });
	await expect(day.getByRole('button')).toHaveText([
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday'
	]);
	await day.getByRole('button', { name: 'Show Tuesday', exact: true }).click();
	const list = page.getByRole('region', { name: 'Schedule list for Tuesday', exact: true });
	await expect(list.getByRole('heading', { name: 'Tuesday', exact: true })).toBeVisible();
	await expect(list.getByRole('button')).toHaveCount(2);
	await expect(list.getByRole('status')).toHaveCount(0);
	await day.getByRole('button', { name: 'Show Wednesday', exact: true }).click();
	const emptyList = page.getByRole('region', { name: 'Schedule list for Wednesday', exact: true });
	await expect(emptyList.getByRole('status')).toHaveText('No events scheduled for this day.');
	await expect(emptyList.getByRole('button')).toHaveCount(0);
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, emptyList);
	}
	await day.getByRole('button', { name: 'Show Tuesday', exact: true }).click();
	await expect(list.getByRole('button')).toHaveCount(2);
	await expect(list.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Previous week|Next week|This week/ })).toHaveCount(
		0
	);
	await chooseRadio(page, 'Calendar view');
	await expect(page.getByRole('region', { name: /Calendar timeline/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Algorithms Test, .*2025-/ })).toHaveCount(0);
	await chooseRadio(page, 'List view');
	await expect(list).toBeVisible();
});
