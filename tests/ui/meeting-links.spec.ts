import { test, expect } from './extension.fixture';
import { chooseRadio, fitsViewport, selectFriends } from './helpers';
import { origin } from './backend';
import type { MeetingLink, MeetingLinkInput } from '../../src/lib/types';

function link(id: string, title: string, status: MeetingLink['status'] = 'active'): MeetingLink {
	return {
		id,
		title,
		status,
		starts_on: '2026-10-07',
		ends_on: '2026-10-09',
		duration_minutes: 30,
		created_at: '2026-10-06T14:00:00Z',
		expires_at: '2026-10-13T03:59:59Z',
		booking: null
	};
}
test('link ordering, three-item expansion and booking handoff use authorized saved responses', async ({
	extension
}) => {
	const { page, context } = extension;
	const booked = {
		...link('booked', 'Booking title', 'used'),
		booking: {
			meeting_id: 'saved-booking',
			start_time: '2026-10-07T16:00:00Z',
			end_time: '2026-10-07T16:30:00Z',
			guest_name: 'Guest Test',
			guest_email: 'guest@example.invalid'
		}
	};
	const links = [
		link('expired', 'Expired link', 'expired'),
		link('used', 'Used link', 'used'),
		link('revoked', 'Revoked link', 'revoked'),
		link('active', 'Active link'),
		booked
	];
	let available = true;
	await context.route(origin + '/api/meeting_links', (route) =>
		route.request().method() === 'GET'
			? route.fulfill({ json: { meeting_links: links } })
			: route.fallback()
	);
	const bookingMeeting = {
		id: 'saved-booking',
		title: 'Server meeting title',
		location: 'Server location',
		start_time: '2026-10-07T12:00:00-04:00',
		end_time: '2026-10-07T12:30:00-04:00',
		time_zone: 'America/New_York',
		frequency: 'one_time',
		recurrence: null,
		repeat_until: null,
		invite_friends: false,
		role: 'owner',
		can_edit: true,
		can_delete: true,
		can_leave: false,
		owner: { id: 'usr-test', name: 'Organizer Test' },
		friends: [],
		guest: { name: 'Guest Test', email: 'guest@example.invalid' },
		destinations: ['ics'],
		publications: []
	};
	await context.route(origin + '/api/friends/meetings/saved-booking', (route) =>
		available
			? route.fulfill({ json: { meeting: bookingMeeting } })
			: route.fulfill({ status: 404, json: { error: 'Saved meeting unavailable' } })
	);
	await context.route(origin + '/api/friends/meetings?*', (route) => {
		const meeting = bookingMeeting;
		return route.fulfill({
			json: available
				? {
						meetings: [meeting],
						occurrences: [
							{
								id: 'booked-occurrence',
								meeting_id: meeting.id,
								start_time: meeting.start_time,
								end_time: meeting.end_time
							}
						]
					}
				: { meetings: [], occurrences: [] }
		});
	});
	await extension.open();
	await selectFriends(page);
	const section = page.getByRole('region', { name: 'One-time meeting links' });
	await expect(section.locator('.link-row h3')).toHaveText([
		'Booking title',
		'Active link',
		'Used link'
	]);
	await section.getByRole('button', { name: 'Show more meeting links' }).click();
	await expect(section.locator('.link-row h3')).toHaveText([
		'Booking title',
		'Active link',
		'Used link',
		'Expired link',
		'Revoked link'
	]);
	await section.getByRole('button', { name: 'View meeting details' }).click();
	const details = page.getByRole('dialog', { name: 'Meeting details', exact: true });
	await expect(details.getByRole('heading', { name: 'Server meeting title' })).toBeVisible();
	await expect(details.getByRole('button', { name: 'Edit meeting', exact: true })).toBeVisible();
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('button', { name: 'Compare calendars', exact: true }).click();
	await page.getByRole('button', { name: '← Back to Friends' }).click();
	await expect(section.locator('.link-row')).toHaveCount(5);
	available = false;
	await page.getByRole('button', { name: 'Refresh friends', exact: true }).click();
	await expect(section.locator('.link-row')).toHaveCount(3);
	await section.getByRole('button', { name: 'View meeting details' }).click();
	await expect(details.getByRole('heading', { name: 'Booking title' })).toBeVisible();
	await expect(details).toContainText('Guest Test');
	await expect(details.getByRole('button', { name: /Edit|Delete|Leave/ })).toHaveCount(0);
});

test('link creation rejection preserves edits and generated URL is only shown once; revoke errors stay in popup', async ({
	extension
}) => {
	const { page, context } = extension;
	const links: MeetingLink[] = [];
	const bodies: MeetingLinkInput[] = [];
	let failCreate = true,
		failRevoke = true;
	await context.route(origin + '/api/meeting_links', async (route) => {
		if (route.request().method() === 'GET')
			return route.fulfill({ json: { meeting_links: links } });
		if (route.request().method() !== 'POST') return route.fallback();
		const body = route.request().postDataJSON() as MeetingLinkInput;
		bodies.push(body);
		if (failCreate) {
			failCreate = false;
			return route.fulfill({ status: 422, json: { error: 'Link creation rejected' } });
		}
		const result = { ...link('generated', ''), ...body, title: body.title ?? null };
		links.push(result);
		return route.fulfill({
			json: { meeting_link: { ...result, url: 'https://example.invalid/guest/creation-only' } }
		});
	});
	await context.route(origin + '/api/meeting_links/generated', (route) => {
		if (route.request().method() !== 'DELETE') return route.fallback();
		if (failRevoke) {
			failRevoke = false;
			return route.fulfill({ status: 503, json: { error: 'Revoke rejected' } });
		}
		links[0] = { ...links[0], status: 'revoked' };
		return route.fulfill({ json: { meeting_link: links[0] } });
	});
	await extension.open('friends');
	const section = page.getByRole('region', { name: 'One-time meeting links' });
	await section.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting link', exact: true });
	await editor.getByLabel('Meeting name (optional)').fill('Real link payload');
	await editor.getByLabel('First bookable date').fill('2026-10-07');
	await editor.getByLabel('Last bookable date').fill('2026-10-09');
	await editor.getByLabel('Link expiry date').fill('2026-10-12');
	await editor.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	await expect(editor.getByRole('alert')).toHaveText('Link creation rejected');
	await expect(editor.getByLabel('Meeting name (optional)')).toHaveValue('Real link payload');
	await editor.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	await expect(editor.getByLabel('Guest booking URL')).toHaveValue(
		'https://example.invalid/guest/creation-only'
	);
	expect(bodies).toHaveLength(2);
	expect(bodies[1]).toEqual({
		title: 'Real link payload',
		starts_on: '2026-10-07',
		ends_on: '2026-10-09',
		duration_minutes: 30,
		expires_at: '2026-10-13T03:59:59.999Z'
	});
	for (const width of [320, 480, 1280]) {
		await page.setViewportSize({ width, height: 900 });
		await fitsViewport(page, editor);
	}
	await editor.getByRole('button', { name: 'Done', exact: true }).click();
	const warning = page.getByRole('alertdialog', { name: 'Leave without copying?' });
	await expect(warning).toBeVisible();
	await warning.getByRole('button', { name: 'Keep link open' }).click();
	await expect(editor.getByLabel('Guest booking URL')).toBeVisible();
	await editor.getByRole('button', { name: 'Done', exact: true }).click();
	await warning.getByRole('button', { name: 'Leave link', exact: true }).click();
	await expect(editor).toBeHidden();
	await expect(section.getByRole('button', { name: /Copy|Open/ })).toHaveCount(0);
	await section.getByRole('button', { name: 'Revoke…', exact: true }).click();
	const revoke = page.getByRole('alertdialog', { name: 'Revoke meeting link?' });
	await revoke.getByRole('button', { name: 'Revoke link', exact: true }).click();
	await expect(revoke.getByRole('alert')).toHaveText('Revoke rejected');
	await expect(section.getByRole('alert')).toHaveCount(0);
	await revoke.getByRole('button', { name: 'Revoke link', exact: true }).click();
	await expect(revoke).toBeHidden();
	await expect(section.getByText('Revoked', { exact: true })).toBeVisible();
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		for (const width of [320, 480, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			await fitsViewport(page, section);
			const style = await section.evaluate((element) => {
				const css = getComputedStyle(element);
				return {
					background: css.backgroundColor,
					padding: css.paddingTop,
					gap: css.gap,
					border: css.borderTopWidth
				};
			});
			expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
			expect(style.padding).toBe('16px');
			expect(style.gap).toBe('16px');
			expect(style.border).toBe('1px');
		}
	}
});

test('uncertain link creation is locked through navigation until explicit list reconciliation', async ({
	extension
}) => {
	const { page, context } = extension;
	let posts = 0,
		reads = 0;
	const links: MeetingLink[] = [];
	await context.route(origin + '/api/meeting_links', (route) => {
		if (route.request().method() === 'GET') {
			reads++;
			return route.fulfill({ json: { meeting_links: links } });
		}
		if (route.request().method() !== 'POST') return route.fallback();
		posts++;
		links.push(link('possibly-created', 'Possibly created'));
		return route.fulfill({ status: 503, json: { error: 'Creation connection lost' } });
	});
	await extension.open('friends');
	const section = page.getByRole('region', { name: 'One-time meeting links' });
	await section.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	const editor = page.getByRole('dialog', { name: 'Create meeting link', exact: true });
	await editor.getByLabel('First bookable date').fill('2026-10-07');
	await editor.getByLabel('Last bookable date').fill('2026-10-09');
	await editor.getByRole('button', { name: 'Create meeting link', exact: true }).click();
	await expect(editor.getByRole('alert')).toContainText('this request will not be repeated');
	await expect(
		editor.getByRole('button', { name: 'Create meeting link', exact: true })
	).toBeDisabled();
	await editor.getByRole('button', { name: 'Check link list' }).click();
	await chooseRadio(page, 'Calendar');
	await chooseRadio(page, 'Friends');
	await expect(
		section.getByRole('button', { name: 'Create meeting link', exact: true })
	).toBeDisabled();
	const before = reads;
	await section.getByRole('button', { name: 'Refresh links', exact: true }).click();
	await expect.poll(() => reads).toBeGreaterThan(before);
	await section.getByRole('button', { name: 'I checked the list · Allow a new link' }).click();
	await expect(
		section.getByRole('button', { name: 'Create meeting link', exact: true })
	).toBeEnabled();
	expect(posts).toBe(1);
});
