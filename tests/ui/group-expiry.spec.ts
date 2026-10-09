import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { friends, now, origin } from './backend';
import { chooseRadio, fitsViewport, toggle } from './helpers';
import { calendarDateTime, shiftDate } from '../../src/lib/calendarDates';

function studyGroup(expires_at: string | null = '2026-10-20T03:45:00Z') {
	return { id: 'group-study', name: 'Study group', members: [friends[0]], expires_at };
}

async function groupBackend(context: BrowserContext, group: ReturnType<typeof studyGroup> | null) {
	const state = { group, status: 200, bodies: [] as Record<string, unknown>[] };
	await context.route(origin + '/api/friends/groups', async (route) => {
		if (route.request().method() === 'GET')
			return route.fulfill({ json: { groups: state.group ? [state.group] : [] } });
		if (route.request().method() !== 'POST') return route.fallback();
		return save(route);
	});
	await context.route(origin + '/api/friends/groups/group-study', async (route) => {
		if (route.request().method() === 'PATCH') return save(route);
		if (route.request().method() !== 'DELETE') return route.fallback();
		state.group = null;
		return route.fulfill({ status: state.status, json: { ok: state.status === 200 } });
	});
	async function save(route: import('@playwright/test').Route) {
		const body = route.request().postDataJSON() as Record<string, unknown>;
		state.bodies.push(body);
		if (state.status !== 200)
			return route.fulfill({ status: state.status, json: { error: 'Group save rejected' } });
		const expires_at =
			body.expires_at === null
				? null
				: typeof body.expires_at === 'string'
					? new Date(
							Date.parse(calendarDateTime(shiftDate(body.expires_at, 1), '00:00')) - 1
						).toISOString()
					: (state.group?.expires_at ?? null);
		state.group = {
			id: 'group-study',
			name: String(body.name),
			members: friends.filter((friend) => (body.member_ids as string[]).includes(friend.id)),
			expires_at
		};
		return route.fulfill({ json: { group: state.group } });
	}
	return state;
}

async function openGroups(page: Page) {
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	await chooseRadio(drawer, 'Groups');
	return drawer;
}

async function selectStudyGroup(page: Page) {
	await chooseRadio(page, 'Friends');
	await page.getByRole('button', { name: /^People:/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await toggle(picker, 'Study group', true);
	await toggle(picker, /Ben Test/, true);
	await picker.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'People: You + 2 friends', exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Shared free periods' }).getByRole('button').first()
	).toBeVisible();
}

test('group creation sends an end date directly and supports changing and clearing it', async ({
	extension
}) => {
	const { page, context } = extension;
	const state = await groupBackend(context, null);
	await extension.open();
	const drawer = await openGroups(page);
	await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
	await drawer.getByLabel('Group name').fill('Study group');
	await toggle(drawer, 'Ada Test', true);
	await drawer.getByLabel('Group end date (optional)').fill('2026-11-01');
	await expect(drawer.getByText(/When the end date passes/)).toContainText(
		'Your friendships remain'
	);
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, drawer);
	}
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	expect(state.bodies[0]).toEqual({
		name: 'Study group',
		member_ids: ['friend-ada'],
		expires_at: '2026-11-01'
	});
	await expect(drawer.getByText(/Ends on/)).toContainText('11/1/2026');
	await drawer.getByText('Study group', { exact: true }).click();
	await expect(drawer.getByLabel('Group end date (optional)')).toHaveValue('2026-11-01');
	await expect(drawer.getByText(/Ends on/)).toContainText('11/1/2026');
	await drawer.getByLabel('Group end date (optional)').fill('2026-12-01');
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	expect(state.bodies[1].expires_at).toBe('2026-12-01');
	await drawer.getByText('Study group', { exact: true }).click();
	await drawer.getByLabel('Group end date (optional)').fill('');
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	expect(state.bodies[2].expires_at).toBeNull();
	await expect(drawer.getByText(/Ends on/)).toHaveCount(0);
	await drawer.getByText('Study group', { exact: true }).click();
	await expect(drawer.getByLabel('Group end date (optional)')).toHaveValue('');
});

test('name and membership edits omit unchanged timestamps, including friend detail toggles', async ({
	extension
}) => {
	const { page, context } = extension;
	const state = await groupBackend(context, studyGroup());
	await extension.open();
	const drawer = await openGroups(page);
	await expect(drawer.getByText(/Ends on/)).toContainText('10/19/2026');
	await drawer.getByText('Study group', { exact: true }).click();
	await expect(drawer.getByLabel('Group end date (optional)')).toHaveValue('2026-10-19');
	await drawer.getByLabel('Group name').fill('Renamed group');
	await toggle(drawer, 'Ben Test', true);
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByText('Renamed group', { exact: true })).toBeVisible();
	expect(state.bodies[0]).toEqual({
		name: 'Renamed group',
		member_ids: ['friend-ada', 'friend-ben']
	});
	await chooseRadio(drawer, 'People');
	await drawer.getByText('Cam Test', { exact: true }).click();
	await toggle(drawer, 'Renamed group', true);
	await expect.poll(() => state.bodies.length).toBe(2);
	await expect(drawer.getByRole('checkbox', { name: 'Renamed group' })).toBeEnabled();
	expect(state.bodies[1]).toEqual({
		name: 'Renamed group',
		member_ids: ['friend-ada', 'friend-ben', 'friend-cam']
	});
	expect(state.group?.expires_at).toBe('2026-10-20T03:45:00Z');
	await chooseRadio(drawer, 'Groups');
	await drawer.getByText('Renamed group', { exact: true }).click();
	await expect(drawer.getByLabel('Group end date (optional)')).toHaveValue('2026-10-19');
});

test('group validation and server errors preserve all entered fields for retry', async ({
	extension
}) => {
	const { page, context } = extension;
	const state = await groupBackend(context, null);
	await extension.open();
	const drawer = await openGroups(page);
	await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
	await drawer.getByLabel('Group name').fill('Study group');
	await toggle(drawer, 'Ben Test', true);
	const endDate = drawer.getByLabel('Group end date (optional)');
	await endDate.fill('2026-10-05');
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByRole('alert')).toContainText('Choose today or a future end date');
	expect(state.bodies).toHaveLength(0);
	await expect(endDate).toHaveValue('2026-10-05');
	await endDate.fill('2026-10-06');
	for (const status of [400, 422, 503]) {
		state.status = status;
		await drawer.getByRole('button', { name: 'Save group' }).click();
		await expect(drawer.getByRole('alert')).toContainText('Your edits are kept');
		await expect(drawer.getByRole('button', { name: 'Save group' })).toBeEnabled();
		await expect(endDate).toHaveValue('2026-10-06');
		await expect(drawer.getByLabel('Group name')).toHaveValue('Study group');
		await expect(drawer.getByRole('checkbox', { name: 'Ben Test' })).toBeChecked();
	}
	state.status = 200;
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	expect(state.bodies.at(-1)?.expires_at).toBe('2026-10-06');
});

for (const action of ['Save group', 'Delete group']) {
	test(`a group 404 on ${action} removes the cached group and preserves friends and schedules`, async ({
		extension
	}) => {
		const { page, context, network } = extension;
		const state = await groupBackend(context, studyGroup());
		await extension.open();
		await selectStudyGroup(page);
		await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
		await chooseRadio(page, 'Detailed');
		await expect(page.getByRole('button', { name: /Ada Class/ }).first()).toBeVisible();
		const scheduleReads = network.filter((row) => row.path.includes('processed_events')).length;
		const drawer = await openGroups(page);
		await drawer.getByText('Study group', { exact: true }).click();
		await drawer.getByLabel('Group name').fill('Kept draft');
		await drawer.getByLabel('Group end date (optional)').fill('2026-12-01');
		state.status = 404;
		state.group = null;
		await drawer.getByRole('button', { name: action }).click();
		await expect(drawer.getByRole('button', { name: 'Save group' })).toBeDisabled();
		await expect(drawer.getByRole('button', { name: 'Delete group' })).toBeDisabled();
		await expect(drawer.getByLabel('Group name')).toHaveValue('Kept draft');
		await expect(drawer.getByLabel('Group end date (optional)')).toHaveValue('2026-12-01');
		await expect(
			drawer.getByText('This group is no longer available. Your friendships remain.').first()
		).toBeVisible();
		await drawer.getByRole('button', { name: 'All groups' }).click();
		await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
		await chooseRadio(drawer, 'People');
		for (const friend of friends)
			await expect(drawer.getByText(friend.name, { exact: true })).toBeVisible();
		await drawer.getByRole('button', { name: 'Close manage friends' }).click();
		await expect(page.getByRole('button', { name: /Ada Class/ }).first()).toBeVisible();
		expect(network.filter((row) => row.path.includes('processed_events'))).toHaveLength(
			scheduleReads
		);
		await chooseRadio(page, 'Friends');
		await page.getByRole('button', { name: /^People:/ }).click();
		const picker = page.getByRole('dialog', { name: 'Select people' });
		await expect(picker.getByRole('checkbox', { name: 'Study group' })).toHaveCount(0);
		await expect(picker.getByRole('checkbox', { name: /Ada Test/ })).toBeChecked();
	});
}

test('clock expiry removes a group from an open editor and picker without dropping participants', async ({
	extension
}) => {
	const { page, context } = extension;
	await groupBackend(context, studyGroup('2026-10-06T12:01:00-04:00'));
	await page.clock.install({ time: new Date(now) });
	await extension.open();
	await selectStudyGroup(page);
	const drawer = await openGroups(page);
	await drawer.getByText('Study group', { exact: true }).click();
	await drawer.getByLabel('Group name').fill('Unsaved name');
	await page.clock.runFor(61_000);
	await expect(
		drawer.getByText('This group is no longer available. Your friendships remain.')
	).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Save group' })).toBeDisabled();
	await expect(drawer.getByLabel('Group name')).toHaveValue('Unsaved name');
	await drawer.getByRole('button', { name: 'All groups' }).click();
	await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
	await drawer.getByRole('button', { name: 'Close manage friends' }).click();
	await page.getByRole('button', { name: /^People:/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await expect(picker.getByRole('checkbox', { name: 'Study group' })).toHaveCount(0);
	await expect(picker.getByRole('checkbox', { name: /Ada Test/ })).toBeChecked();
	await expect(picker.getByRole('checkbox', { name: /Ben Test/ })).toBeChecked();
});

test('refresh removes unavailable groups and stale editors, and initial loads filter expired groups', async ({
	extension
}) => {
	const { page, context } = extension;
	const state = await groupBackend(context, studyGroup());
	await extension.open();
	const drawer = await openGroups(page);
	await drawer.getByText('Study group', { exact: true }).click();
	await drawer.getByLabel('Group name').fill('Kept on refresh');
	await drawer.getByRole('button', { name: 'Close manage friends' }).click();
	state.group = null;
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	await expect(drawer.getByRole('button', { name: 'Save group' })).toBeDisabled();
	await expect(drawer.getByLabel('Group name')).toHaveValue('Kept on refresh');
	await drawer.getByRole('button', { name: 'All groups' }).click();
	await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
	state.group = studyGroup('2026-10-06T11:59:59-04:00');
	await page.reload();
	await openGroups(page);
	await expect(drawer.getByRole('button', { name: 'Create group', exact: true })).toBeEnabled();
	await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
});

test('a confirmed expiry extension arriving after the old end time stays available', async ({
	extension
}) => {
	const { page, context } = extension;
	await groupBackend(context, studyGroup('2026-10-06T12:01:00-04:00'));
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested = false;
	await context.route(origin + '/api/friends/groups/group-study', async (route) => {
		if (route.request().method() !== 'PATCH') return route.fallback();
		requested = true;
		await pending;
		await route.fulfill({ json: { group: studyGroup('2026-12-02T04:59:59Z') } });
	});
	await page.clock.install({ time: new Date(now) });
	await extension.open();
	const drawer = await openGroups(page);
	await drawer.getByText('Study group', { exact: true }).click();
	await drawer.getByLabel('Group end date (optional)').fill('2026-12-01');
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect.poll(() => requested).toBe(true);
	await page.clock.runFor(61_000);
	await expect(
		drawer.getByText('This group is no longer available. Your friendships remain.')
	).toBeVisible();
	release();
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	await expect(drawer.getByText('Study group', { exact: true })).toBeVisible();
	await expect(drawer.getByText(/Ends on/)).toContainText('12/1/2026');
});

test('a late group save cannot populate a changed session', async ({ extension }) => {
	const { page, context, worker } = extension;
	const state = await groupBackend(context, studyGroup());
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested = false;
	await context.route(origin + '/api/friends/groups/group-study', async (route) => {
		if (route.request().method() !== 'PATCH') return route.fallback();
		requested = true;
		await pending;
		await route.fulfill({ json: { group: studyGroup('2026-12-02T04:59:59Z') } });
	});
	await extension.open();
	const drawer = await openGroups(page);
	await drawer.getByText('Study group', { exact: true }).click();
	await drawer.getByLabel('Group end date (optional)').fill('2026-12-01');
	await drawer.getByRole('button', { name: 'Save group' }).click();
	await expect.poll(() => requested).toBe(true);
	state.group = null;
	await worker.evaluate(async () => {
		const { environment_data: data } = await chrome.storage.local.get('environment_data');
		const parts = data.jwt_tokens.staging.split('.');
		const payload = JSON.parse(atob(parts[1]));
		payload.jti = 'changed-synthetic-session';
		parts[1] = btoa(JSON.stringify(payload))
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_');
		data.jwt_tokens.staging = parts.join('.');
		await chrome.storage.local.set({ environment_data: data });
	});
	await expect(drawer).toBeHidden();
	await openGroups(page);
	await expect(drawer.getByRole('button', { name: 'Create group', exact: true })).toBeEnabled();
	const response = page.waitForResponse(
		(reply) =>
			reply.url() === origin + '/api/friends/groups/group-study' &&
			reply.request().method() === 'PATCH'
	);
	release();
	await (await response).finished();
	await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
	await expect(drawer.getByRole('heading', { name: 'Groups', exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'Close manage friends' }).click();
	await openGroups(page);
	await expect(drawer.getByText('Study group', { exact: true })).toHaveCount(0);
});
