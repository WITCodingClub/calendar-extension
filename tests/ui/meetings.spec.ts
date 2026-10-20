import type { Route } from '@playwright/test';
import { test, expect, type Extension } from './extension.fixture';
import { chooseRadio, fitsViewport, selectFriends } from './helpers';
import { origin, friends, responseFor } from './backend';
import { calendarDateTime, shiftDate } from '../../src/lib/datetime';
import type {
	SavedMeeting,
	SavedMeetingInput,
	SavedMeetingOccurrence
} from '../../src/lib/friends/savedMeetings';

function record(
	id: string,
	title: string,
	date: string,
	role: SavedMeeting['role'] = 'owner',
	weekly = false
): SavedMeeting {
	return {
		id,
		title,
		location: null,
		start_time: date + 'T12:00:00-04:00',
		end_time: date + 'T12:30:00-04:00',
		time_zone: 'America/New_York',
		frequency: weekly ? 'weekly' : 'one_time',
		recurrence: weekly ? 'RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261221T045959Z' : null,
		repeat_until: weekly ? '2026-12-20' : null,
		invite_friends: true,
		role,
		can_edit: role === 'owner',
		can_delete: role === 'owner',
		can_leave: role === 'invitee',
		owner: role === 'owner' ? { id: 'usr-test', name: 'Organizer Test' } : friends[0],
		friends:
			role === 'owner'
				? friends.slice(0, 2)
				: [{ id: 'usr-test', name: 'Organizer Test' }, friends[1]],
		destinations: role === 'owner' ? ['ics'] : [],
		publications:
			role === 'owner'
				? [{ provider: 'ics', status: 'published', invitation_status: 'not_requested' }]
				: []
	};
}
function local(value: string) {
	const instant = new Date(value);
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(instant)
			.map((part) => [part.type, part.value])
	);
	const wall = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
	const offset = (Date.parse(wall + 'Z') - instant.getTime()) / 60000;
	return (
		wall +
		(offset < 0 ? '-' : '+') +
		String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0') +
		':' +
		String(Math.abs(offset) % 60).padStart(2, '0')
	);
}
async function meetingsBackend(extension: Extension, records: SavedMeeting[]) {
	const state = {
		records,
		posts: [] as Array<{ body: SavedMeetingInput; key: string }>,
		patches: [] as Record<string, unknown>[],
		deleted: [] as string[],
		left: [] as string[],
		reads: [] as Array<{ start: string; end: string }>,
		createFailure: 0,
		saveFailure: 0,
		removeFailure: 0
	};
	const creations = new Map<string, SavedMeeting>();
	function occurrences(from: string, until: string) {
		const items: SavedMeetingOccurrence[] = [];
		for (const meeting of state.records)
			for (let date = meeting.start_time.slice(0, 10); date < until; date = shiftDate(date, 7)) {
				if (meeting.repeat_until && date > meeting.repeat_until) break;
				const start = calendarDateTime(date, meeting.start_time.slice(11, 16));
				const end = new Date(
					Date.parse(start) + Date.parse(meeting.end_time) - Date.parse(meeting.start_time)
				).toISOString();
				if (
					Date.parse(start) < Date.parse(calendarDateTime(until, '00:00')) &&
					Date.parse(end) > Date.parse(calendarDateTime(from, '00:00'))
				)
					items.push({
						id: meeting.id + ':' + date,
						meeting_id: meeting.id,
						start_time: local(start),
						end_time: local(end)
					});
				if (meeting.frequency === 'one_time') break;
			}
		return items;
	}
	await extension.context.route(
		new RegExp('^' + origin.replaceAll('.', '\\.') + '/api/friends/meetings(?:[/?]|$)'),
		async (route: Route) => {
			const url = new URL(route.request().url());
			const method = route.request().method();
			if (url.pathname === '/api/friends/meetings' && method === 'GET') {
				const start = url.searchParams.get('start')!,
					end = url.searchParams.get('end')!;
				state.reads.push({ start, end });
				const items = occurrences(start, end);
				return route.fulfill({
					json: {
						meetings: state.records.filter((meeting) =>
							items.some((item) => item.meeting_id === meeting.id)
						),
						occurrences: items
					}
				});
			}
			if (url.pathname === '/api/friends/meetings' && method === 'POST') {
				const body = route.request().postDataJSON() as SavedMeetingInput;
				const key = route.request().headers()['idempotency-key'];
				state.posts.push({ body, key });
				let meeting = creations.get(key);
				if (!meeting) {
					meeting = {
						...record('created-' + creations.size, body.title, body.start_time.slice(0, 10)),
						location: body.location ?? null,
						start_time: local(body.start_time),
						end_time: local(body.end_time),
						frequency: body.frequency ?? 'one_time',
						friends: friends.filter((person) => body.friend_ids.includes(person.id)),
						invite_friends: body.invite_friends ?? true,
						destinations: body.destinations ?? ['ics']
					};
					creations.set(key, meeting);
					state.records.push(meeting);
				}
				if (state.createFailure) {
					const status = state.createFailure;
					state.createFailure = 0;
					return route.fulfill({ status, json: { error: 'Creation response unavailable' } });
				}
				return route.fulfill({ json: { meeting } });
			}
			const match = url.pathname.match(/^\/api\/friends\/meetings\/([^/]+)(\/attendance)?$/);
			if (!match) return route.fallback();
			const id = match[1];
			if (method === 'PATCH') {
				const body = route.request().postDataJSON() as Record<string, unknown>;
				state.patches.push(body);
				if (state.saveFailure) {
					const status = state.saveFailure;
					state.saveFailure = 0;
					return route.fulfill({ status, json: { error: 'Meeting edit rejected' } });
				}
				const current = state.records.find((item) => item.id === id)!;
				const meeting = {
					...current,
					...body,
					start_time: body.start_time ? local(String(body.start_time)) : current.start_time,
					end_time: body.end_time ? local(String(body.end_time)) : current.end_time
				} as SavedMeeting;
				state.records = state.records.map((item) => (item.id === id ? meeting : item));
				return route.fulfill({ json: { meeting } });
			}
			if (method === 'DELETE') {
				if (state.removeFailure) {
					const status = state.removeFailure;
					state.removeFailure = 0;
					return route.fulfill({ status, json: { error: 'Meeting removal rejected' } });
				}
				(match[2] ? state.left : state.deleted).push(id);
				state.records = state.records.filter((item) => item.id !== id);
				return route.fulfill({ status: 204 });
			}
			return route.fallback();
		}
	);
	await extension.context.route(
		new RegExp('^' + origin.replaceAll('.', '\\.') + '/api/(?:user|friends/[^/]+)/busy_blocks\\?'),
		async (route) => {
			const url = new URL(route.request().url());
			const base = responseFor('GET', url.pathname, null, url.searchParams) as {
				time_zone: string;
				start_date: string;
				end_date: string;
				busy: Array<{ date: string; weekday: string; start: string; end: string }>;
			};
			const id = url.pathname.includes('/user/') ? 'usr-test' : url.pathname.split('/')[3];
			for (const occurrence of occurrences(base.start_date, shiftDate(base.end_date, 1))) {
				const meeting = state.records.find((item) => item.id === occurrence.meeting_id)!;
				if (![meeting.owner, ...meeting.friends].some((person) => person.id === id)) continue;
				base.busy.push({
					date: occurrence.start_time.slice(0, 10),
					weekday: new Date(occurrence.start_time)
						.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
						.toLowerCase(),
					start: occurrence.start_time.slice(11, 16),
					end: occurrence.end_time.slice(11, 16)
				});
			}
			return route.fulfill({ json: base });
		}
	);
	return state;
}

test('real create payload and idempotent retry do not duplicate meetings', async ({
	extension
}) => {
	const state = await meetingsBackend(extension, []);
	const { page } = extension;
	await extension.open();
	await selectFriends(page);
	const planner = page.getByRole('region', { name: 'Friends planning' });
	await planner.getByRole('button', { name: /Tuesday, Oct 6, 12:15 to 12:45/ }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting', exact: true });
	await editor.getByLabel('Meeting title').fill('API meeting');
	await editor.getByText('More options', { exact: true }).click();
	await editor.getByLabel('Location (optional)').fill('Test room');
	state.createFailure = 503;
	await editor.getByRole('button', { name: 'Create & invite', exact: true }).click();
	const confirmation = page.getByRole('dialog', { name: 'Confirm meeting' });
	await confirmation.getByRole('button', { name: 'Create & invite', exact: true }).click();
	await expect(confirmation.getByRole('alert')).toContainText('Retry to confirm this meeting');
	await confirmation.getByRole('button', { name: 'Back to editing' }).click();
	await expect(editor.getByLabel('Meeting title')).toBeDisabled();
	await expect(editor.getByRole('button', { name: 'Discard', exact: true })).toBeDisabled();
	await editor.getByRole('button', { name: 'Retry creation' }).click();
	await confirmation.getByRole('button', { name: 'Retry creation' }).click();
	await expect(page.getByRole('region', { name: 'Calendar comparison' })).toBeVisible();
	expect(state.posts).toHaveLength(2);
	expect(state.posts[0]).toEqual(state.posts[1]);
	expect(state.posts[0].body).toEqual({
		title: 'API meeting',
		location: 'Test room',
		friend_ids: ['friend-ada', 'friend-ben'],
		start_time: '2026-10-06T16:15:00.000Z',
		end_time: '2026-10-06T16:45:00.000Z',
		frequency: 'one_time',
		invite_friends: true,
		destinations: ['ics']
	});
	expect(state.records).toHaveLength(1);
	expect(state.posts[0].key).toBeTruthy();
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	await chooseRadio(comparison, 'List');
	await comparison.getByRole('button', { name: 'Show Tuesday, Oct 6, 2026' }).click();
	await expect(comparison.getByRole('button', { name: /Saved meeting - API meeting/ })).toHaveCount(
		1
	);
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await expect(
		page.getByRole('region', { name: 'Saved meetings' }).getByText('API meeting', { exact: true })
	).toBeVisible();
	await expect(planner.getByText('Saved draft', { exact: true })).toHaveCount(0);
});

test('owner series edits and deletion update upcoming meetings and comparison', async ({
	extension
}) => {
	const state = await meetingsBackend(extension, [
		record('once', 'One-time API meeting', '2026-10-07'),
		record('weekly', 'Weekly API meeting', '2026-10-08', 'owner', true),
		record('invited', 'Invitee API meeting', '2026-10-09', 'invitee', true),
		record('guest', 'Guest API meeting', '2026-10-12')
	]);
	const { page } = extension;
	await extension.open();
	await selectFriends(page);
	const upcoming = page.getByRole('region', { name: 'Saved meetings', exact: true });
	await expect(upcoming.locator('.meeting-row')).toHaveCount(3);
	expect(state.reads).toContainEqual({ start: '2026-10-06', end: '2026-10-20' });
	await upcoming.getByRole('button', { name: 'Load more', exact: true }).click();
	await expect(upcoming.locator('.meeting-row')).toHaveCount(6);
	await upcoming
		.getByRole('button', { name: /Details for Weekly API meeting/ })
		.first()
		.click();
	const details = page.getByRole('dialog', { name: 'Meeting details', exact: true });
	await details.getByRole('button', { name: 'Edit series', exact: true }).click();
	const edit = page.getByRole('dialog', { name: 'Edit series', exact: true });
	await edit.getByLabel('Meeting title').fill('Updated API series');
	await edit.getByRole('button', { name: 'Custom duration', exact: true }).click();
	await edit.getByLabel('Duration (minutes)', { exact: true }).fill('45');
	state.saveFailure = 422;
	await edit.getByRole('button', { name: 'Save series', exact: true }).click();
	await expect(edit.getByRole('alert')).toHaveText('Meeting edit rejected');
	await expect(edit.getByLabel('Meeting title')).toHaveValue('Updated API series');
	await edit.getByRole('button', { name: 'Save series', exact: true }).click();
	await expect(edit).toBeHidden();
	await expect(upcoming.getByText('Updated API series', { exact: true })).toBeVisible();
	expect(state.patches.at(-1)).toEqual({
		title: 'Updated API series',
		end_time: '2026-10-08T16:45:00.000Z'
	});
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	await chooseRadio(comparison, 'List');
	await comparison.getByRole('button', { name: 'Show Thursday, Oct 8, 2026' }).click();
	await expect(
		comparison.getByRole('button', { name: /Saved meeting - Updated API series/ })
	).toHaveCount(1);
	await comparison.getByRole('button', { name: 'Next week', exact: true }).click();
	await expect(
		comparison.getByRole('button', { name: /Saved meeting - Updated API series/ })
	).toHaveCount(1);
	await comparison.getByRole('button', { name: /Saved meeting - Updated API series/ }).click();
	await details.getByRole('button', { name: 'Delete series', exact: true }).click();
	const remove = page.getByRole('alertdialog', { name: 'Delete series?', exact: true });
	state.removeFailure = 503;
	await remove.getByRole('button', { name: 'Delete series', exact: true }).click();
	await expect(remove.getByRole('alert')).toHaveText('Meeting removal rejected');
	await remove.getByRole('button', { name: 'Delete series', exact: true }).click();
	await expect(remove).toBeHidden();
	await expect(
		comparison.getByRole('button', { name: /Saved meeting - Updated API series/ })
	).toHaveCount(0);
	expect(state.deleted).toEqual(['weekly']);
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await expect(upcoming.getByText('Updated API series', { exact: true })).toHaveCount(0);
});

test('invitees can leave a series without removing unrelated Calendar events', async ({
	extension
}) => {
	const state = await meetingsBackend(extension, [
		record('once', 'One-time API meeting', '2026-10-07'),
		record('invited', 'Invitee API meeting', '2026-10-09', 'invitee', true)
	]);
	const { page } = extension;
	await extension.open('friends');
	await selectFriends(page);
	const upcoming = page.getByRole('region', { name: 'Saved meetings', exact: true });
	await upcoming
		.getByRole('button', { name: /Details for Invitee API meeting/ })
		.first()
		.click();
	const details = page.getByRole('dialog', { name: 'Meeting details', exact: true });
	const comparison = page.getByRole('region', { name: 'Calendar comparison' });
	await expect(details.getByRole('button', { name: /Edit|Delete/ })).toHaveCount(0);
	await details.getByRole('button', { name: 'Leave series', exact: true }).click();
	const leave = page.getByRole('alertdialog', { name: 'Leave series?', exact: true });
	for (const width of [320, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, leave);
	}
	await leave.getByRole('button', { name: 'Leave series', exact: true }).click();
	await expect(leave).toBeHidden();
	await expect(upcoming.getByText('Invitee API meeting', { exact: true })).toHaveCount(0);
	expect(state.left).toEqual(['invited']);
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await chooseRadio(comparison, 'List');
	await comparison.getByRole('button', { name: 'This week', exact: true }).click();
	await comparison.getByRole('button', { name: 'Show Friday, Oct 9, 2026' }).click();
	await expect(comparison.getByRole('button', { name: /Invitee API meeting/ })).toHaveCount(0);
	await comparison.getByRole('button', { name: '← Back to Friends' }).click();
	await chooseRadio(page, 'Calendar');
	await chooseRadio(page, 'List view');
	await page.getByRole('button', { name: 'Show Wednesday, Oct 7, 2026' }).click();
	await page.getByRole('button', { name: /Saved meeting - One-time API meeting/ }).click();
	await expect(details.getByRole('heading', { name: 'One-time API meeting' })).toBeVisible();
});

test('feature flags prevent unavailable meeting and link requests', async ({ extension }) => {
	const { page, context, network } = extension;
	await context.route(origin + '/api/user/feature_flags', (route) =>
		route.fulfill({ json: { feature_flags: { friendMeetingEvents: false, meetingLinks: false } } })
	);
	await extension.open();
	await selectFriends(page);
	await expect(page.getByText('Saved meetings are not enabled for this account.')).toBeVisible();
	expect(
		network.filter(
			(row) => row.path === '/api/friends/meetings' || row.path === '/api/meeting_links'
		)
	).toHaveLength(0);
	await page
		.getByRole('region', { name: 'Friends planning' })
		.getByRole('button', { name: /Tuesday, Oct 6, 12:15 to 12:45/ })
		.click();
	const editor = page.getByRole('dialog', { name: 'Create meeting', exact: true });
	await editor.getByLabel('Meeting title').fill('Disabled creation');
	await expect(editor.getByRole('button', { name: 'Create & invite', exact: true })).toBeDisabled();
	await expect(editor.getByRole('alert')).toContainText('not enabled');
});

test('failed feature reads stay visible and can be retried without losing planning selection', async ({
	extension
}) => {
	const { page, context } = extension;
	let fail = true;
	await context.route(origin + '/api/user/feature_flags', (route) =>
		fail
			? route.fulfill({ status: 503, json: { error: 'Feature availability unavailable' } })
			: route.fallback()
	);
	await extension.open('friends');
	await selectFriends(page);
	await expect(page.getByRole('alert')).toContainText('Failed to fetch feature flags: 503');
	await expect(page.getByRole('region', { name: 'One-time meeting links' })).toHaveCount(0);
	fail = false;
	await page.getByRole('button', { name: 'Retry meeting availability', exact: true }).click();
	await expect(page.getByRole('region', { name: 'One-time meeting links' })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Edit people · You, Ada Test, Ben Test', exact: true })
	).toBeVisible();
});
