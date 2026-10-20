import { test, expect } from './extension.fixture';
import { chooseRadio, selectFriends } from './helpers';
import { now } from './backend';

const paths = ['/api/friends', '/api/friends/requests', '/api/friends/groups'];

for (const entry of ['drawer', 'Friends']) {
	test(`Calendar defers friends resources until opening ${entry} and retains them on navigation`, async ({
		extension
	}) => {
		const { page, network } = extension;
		const reads = () => paths.map((path) => network.filter((row) => row.path === path).length);
		await extension.open();
		await expect(page.getByRole('button', { name: /Algorithms Test/ }).first()).toBeVisible();
		expect(reads()).toEqual([0, 0, 0]);
		if (entry === 'drawer') {
			await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
			const drawer = page.getByRole('dialog', { name: 'Manage friends' });
			await expect(drawer.getByText('Ada Test', { exact: true })).toBeVisible();
			await expect.poll(reads).toEqual([1, 1, 1]);
			await drawer.press('Escape');
			await expect(drawer).toBeHidden();
		}
		await chooseRadio(page, 'Friends');
		await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
		await expect.poll(reads).toEqual([1, 1, 1]);
		await chooseRadio(page, 'Calendar');
		await expect(page.getByRole('button', { name: /Algorithms Test/ }).first()).toBeVisible();
		await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
		const drawer = page.getByRole('dialog', { name: 'Manage friends' });
		await expect(drawer.getByText('Ada Test', { exact: true })).toBeVisible();
		expect(reads()).toEqual([1, 1, 1]);
	});
}

test('deferred Calendar loading preserves saved planning participants until Friends needs them', async ({
	extension
}) => {
	const { page, context, network } = extension;
	await extension.open();
	await selectFriends(page);
	await chooseRadio(page, 'Calendar');
	await expect(page.getByRole('button', { name: /Algorithms Test/ }).first()).toBeVisible();
	const before = paths.map((path) => network.filter((row) => row.path === path).length);
	const reopened = await context.newPage();
	await reopened.clock.setFixedTime(new Date(now));
	await reopened.goto(extension.baseUrl + '/calendar.html');
	await expect(reopened.getByRole('button', { name: /Algorithms Test/ }).first()).toBeVisible();
	expect(paths.map((path) => network.filter((row) => row.path === path).length)).toEqual(before);
	await chooseRadio(reopened, 'Friends');
	await expect(
		reopened.getByRole('button', { name: 'Edit people · You, Ada Test, Ben Test', exact: true })
	).toBeVisible();
	const restored = await context.newPage();
	await restored.clock.setFixedTime(new Date(now));
	await restored.goto(extension.baseUrl + '/friends.html?view=calendar');
	const comparison = restored.getByRole('region', { name: 'Calendar comparison' });
	await chooseRadio(comparison, 'Calendar');
	await expect(
		comparison.getByRole('button', { name: /Ben Test · Ben Class, Monday/ })
	).toBeVisible();
});
