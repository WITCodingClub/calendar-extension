import { test, expect } from './extension.fixture';
import { chooseRadio, selectFriends, toggle } from './helpers';
import { friends, now, origin } from './backend';

test('partial person saves retain successful changes, retry remaining writes and preserve planning context', async ({
	extension
}) => {
	const { page, context } = extension;
	let people = friends.map((person) => ({ ...person, expires_at: '2026-10-31T03:59:59.999Z' }));
	let group = { id: 'study', name: 'Study group', members: [friends[0]], expires_at: null };
	let sharing = 0,
		groups = 0,
		expiries = 0,
		fail = true;
	await context.route(origin + '/api/friends', (route) =>
		route.fulfill({ json: { friends: people } })
	);
	await context.route(origin + '/api/friends/groups', (route) =>
		route.request().method() === 'GET'
			? route.fulfill({ json: { groups: [group] } })
			: route.fallback()
	);
	await context.route(origin + '/api/friends/groups/study', (route) => {
		if (route.request().method() !== 'PATCH') return route.fallback();
		groups++;
		if (fail) {
			fail = false;
			return route.fulfill({ status: 503, json: { error: 'Membership save rejected' } });
		}
		const body = route.request().postDataJSON();
		group = { ...group, members: friends.filter((person) => body.member_ids.includes(person.id)) };
		return route.fulfill({ json: { group } });
	});
	await context.route(origin + '/api/friends/friend-ada/visibility', (route) => {
		sharing++;
		const body = route.request().postDataJSON();
		people = people.map((person) =>
			person.id === 'friend-ada'
				? { ...person, visibility: { ...person.visibility, mine: body.visibility } }
				: person
		);
		return route.fulfill({
			json: { friend_id: 'friend-ada', mine: body.visibility, theirs: 'full' }
		});
	});
	await context.route(origin + '/api/friends/friend-ada/expiry', (route) => {
		expiries++;
		expect(route.request().postDataJSON()).toEqual({ expires_at: '2026-11-13T04:59:59.999Z' });
		return route.fulfill({
			json: {
				friendship_id: 'friendship-ada',
				status: 'accepted',
				friend: friends[0],
				expires_at: '2026-10-31T03:59:59.999Z',
				expiry_change: 'proposed'
			}
		});
	});
	await extension.open('friends');
	await selectFriends(page);
	await page.getByRole('button', { name: /^Edit people/ }).click();
	const picker = page.getByRole('dialog', { name: 'Select people' });
	await toggle(picker, /You/, false);
	await picker.getByRole('button', { name: 'Done', exact: true }).click();
	const planner = page.getByRole('region', { name: 'Friends planning' });
	await planner.getByRole('button', { name: /Tuesday, Oct 6, 12:15 to 12:45/ }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting', exact: true });
	await editor.getByLabel('Meeting title').fill('Retained draft');
	await editor.getByRole('button', { name: 'Save draft' }).click();
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	await drawer.getByText('Ada Test', { exact: true }).click();
	await drawer.getByLabel('Your schedule sharing').selectOption('availability_only');
	await toggle(drawer, 'Study group', false);
	await drawer.getByLabel('Friendship end date (optional)').fill('2026-11-12');
	await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(drawer.getByRole('alert')).toContainText('Membership save rejected');
	await expect(
		drawer.getByText('Some updates may be saved. Cancel discards only unsaved edits.')
	).toBeVisible();
	await expect(drawer.getByLabel('Friendship end date (optional)')).toHaveValue('2026-11-12');
	expect(sharing).toBe(1);
	expect(groups).toBe(1);
	expect(expiries).toBe(0);
	await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
	await expect(drawer.getByRole('status')).toContainText('Expiry proposal submitted');
	expect(sharing).toBe(1);
	expect(groups).toBe(2);
	expect(expiries).toBe(1);
	await expect(drawer.getByText(/Pending expiry proposal/)).toContainText('11/12/2026');
	await expect(drawer.getByLabel('Friendship end date (optional)')).toHaveValue('2026-10-30');
	await drawer.getByRole('button', { name: 'Find a time together' }).click();
	await expect(
		planner.getByRole('button', { name: 'Edit people · Ada Test', exact: true })
	).toBeVisible();
	await expect(planner.getByText('Retained draft', { exact: true })).toBeVisible();
	await expect(planner.getByRole('button', { name: '30 min', exact: true })).toBeVisible();
});

test('request expiry/accept retries, decline, cancel and send use real independent contracts', async ({
	extension
}) => {
	const { page, context } = extension;
	let incoming = [
		{
			request_id: 'request-in',
			from: { id: 'friend-in', name: 'Incoming Test' },
			created_at: now,
			expires_at: '2026-10-31T03:59:59.999Z'
		},
		{
			request_id: 'request-decline',
			from: { id: 'friend-decline', name: 'Decline Test' },
			created_at: now
		}
	];
	let outgoing = [
		{ request_id: 'request-out', to: { id: 'friend-out', name: 'Outgoing Test' }, created_at: now }
	];
	const people = [...friends];
	let expiryCalls = 0,
		acceptCalls = 0,
		declines = 0,
		cancels = 0,
		sends = 0;
	await context.route(origin + '/api/friends', (route) =>
		route.fulfill({ json: { friends: people } })
	);
	await context.route(origin + '/api/friends/requests', (route) => {
		if (route.request().method() === 'GET') return route.fulfill({ json: { incoming, outgoing } });
		if (route.request().method() !== 'POST') return route.fallback();
		sends++;
		expect(route.request().postDataJSON()).toMatchObject({
			friend_email: 'new@example.invalid',
			visibility: 'full'
		});
		if (sends === 1) return route.fulfill({ status: 422, json: { error: 'Request rejected' } });
		outgoing.push({
			request_id: 'sent',
			to: { id: 'friend-new', name: 'New Test' },
			created_at: now
		});
		return route.fulfill({ json: { request_id: 'sent' } });
	});
	await context.route(origin + '/api/friends/friend-in/expiry', (route) => {
		expiryCalls++;
		const expires_at = route.request().postDataJSON().expires_at;
		incoming = incoming.map((item) =>
			item.request_id === 'request-in' ? { ...item, expires_at } : item
		);
		return route.fulfill({
			json: {
				friendship_id: 'friendship-in',
				status: 'pending',
				friend: { id: 'friend-in', name: 'Incoming Test' },
				expires_at,
				expiry_change: 'shortened'
			}
		});
	});
	await context.route(origin + '/api/friends/requests/request-in/accept', (route) => {
		acceptCalls++;
		expect(route.request().postDataJSON()).toEqual({ visibility: 'availability_only' });
		if (acceptCalls === 1)
			return route.fulfill({ status: 503, json: { error: 'Acceptance rejected' } });
		incoming = incoming.filter((item) => item.request_id !== 'request-in');
		people.push({
			id: 'friend-in',
			name: 'Incoming Test',
			visibility: { mine: 'availability_only', theirs: 'availability_only' }
		});
		return route.fulfill({
			json: { friendship_id: 'friendship-in', friend: { id: 'friend-in', name: 'Incoming Test' } }
		});
	});
	await context.route(origin + '/api/friends/requests/request-decline/decline', (route) => {
		declines++;
		incoming = incoming.filter((item) => item.request_id !== 'request-decline');
		return route.fulfill({ json: { ok: true } });
	});
	await context.route(origin + '/api/friends/requests/request-out', (route) => {
		if (route.request().method() !== 'DELETE') return route.fallback();
		cancels++;
		outgoing = [];
		return route.fulfill({ json: { ok: true } });
	});
	await extension.open('friends');
	await page.getByRole('button', { name: 'Manage friends', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Manage friends' });
	await chooseRadio(drawer, /^Requests/);
	const request = drawer.getByRole('region', { name: 'Incoming request: Incoming Test' });
	await request.getByRole('button', { name: 'Edit details', exact: true }).click();
	await request.getByLabel('Your sharing on acceptance').selectOption('availability_only');
	await request.getByLabel('End date (optional)').fill('2026-10-19');
	await request.getByRole('button', { name: 'Hide details', exact: true }).click();
	await request.getByRole('button', { name: 'Edit details', exact: true }).click();
	const groupsTab = drawer.getByRole('radio', { name: 'Groups', exact: true });
	const groupsTabId = await groupsTab.getAttribute('id');
	await drawer.locator(`label[for="${groupsTabId}"]`).click();
	await expect(groupsTab).not.toBeChecked();
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await expect(request.getByLabel('End date (optional)')).toHaveValue('2026-10-19');
	await request.getByRole('button', { name: 'Update & accept', exact: true }).click();
	await expect(drawer.getByRole('alert')).toContainText('Acceptance rejected');
	expect(expiryCalls).toBe(1);
	await request.getByRole('button', { name: 'Accept', exact: true }).click();
	await expect(request).toHaveCount(0);
	expect(expiryCalls).toBe(1);
	expect(acceptCalls).toBe(2);
	await drawer
		.getByRole('button', { name: 'Decline friend request from Decline Test', exact: true })
		.click();
	await drawer.getByRole('button', { name: 'Cancel request', exact: true }).click();
	await expect(drawer.getByText('No pending friend requests.')).toBeVisible();
	expect(declines).toBe(1);
	expect(cancels).toBe(1);
	await chooseRadio(drawer, 'People');
	await drawer.getByRole('button', { name: 'Add friend', exact: true }).click();
	await expect(drawer.getByRole('button', { name: 'Send request' })).toBeDisabled();
	await drawer.getByLabel('Email or user ID').fill('new@example.invalid');
	await drawer.getByRole('button', { name: 'Send request', exact: true }).click();
	await expect(drawer.getByRole('alert')).toContainText('Request rejected');
	await expect(drawer.getByLabel('Email or user ID')).toHaveValue('new@example.invalid');
	await drawer.getByRole('button', { name: 'Send request', exact: true }).click();
	await expect(drawer.getByLabel('Email or user ID')).toBeHidden();
	await chooseRadio(drawer, /^Requests/);
	await expect(drawer.getByText('New Test', { exact: true })).toBeVisible();
	expect(sends).toBe(2);
});
