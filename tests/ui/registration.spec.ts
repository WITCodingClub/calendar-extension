import type { Page } from '@playwright/test';
import { test, expect, type Extension } from './extension.fixture';
import { chooseRadio, fitsViewport } from './helpers';
import { origin } from './backend';
import {
	REGISTRATION_PATH,
	registrationReply,
	registrationState,
	type RegistrationState
} from './registrationFixtures';

async function registration(extension: Extension, setup: Partial<RegistrationState> = {}) {
	const state = { ...registrationState(), ...setup };
	await extension.context.route(
		(url) => url.origin === origin && REGISTRATION_PATH.test(url.pathname),
		async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			const reply = registrationReply(
				state,
				request.method(),
				url.pathname,
				request.postDataJSON(),
				url.searchParams
			);
			if (!reply) return route.fallback();
			await route.fulfill({ status: reply.status, json: reply.json, headers: reply.headers });
		}
	);
	return state;
}

const saved = {
	body: {
		courses: [
			{
				code: 'COMP 3350',
				crns: ['20401', '20404'],
				fills: { kind: 'course', label: 'Algorithms' }
			},
			{
				code: 'COMP 3450',
				crns: ['20431'],
				fills: { kind: 'course', label: 'Operating Systems' }
			},
			{
				code: 'PHIL 2100',
				crns: ['20610'],
				fills: { kind: 'placeholder', label: 'HSS Elective' }
			}
		],
		preferences: {}
	},
	updated_at: '2026-10-06T15:00:00Z'
};

const status = (page: Page) =>
	page.getByRole('status').filter({ hasText: /schedule|Busy|match|picked/ });

async function buildSchedule(page: Page) {
	await page.getByRole('button', { name: 'Get started', exact: true }).click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(status(page)).toContainText('2 schedules match so far');
	await page.getByRole('button', { name: 'Skip to results', exact: true }).click();
	await expect(page).toHaveURL(/\/registration\/schedule(?:\.html)?$/);
	await page.getByRole('button', { name: 'Use this schedule', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible();
}

test('courses lead through the questions to a schedule, a section change, review, save and restore', async ({
	extension
}) => {
	const { page } = extension;
	const state = await registration(extension);
	await extension.open('registration');
	await expect(page.getByRole('heading', { name: 'Recommended for Spring 2027' })).toBeVisible();
	await expect(page.getByRole('button', { name: /COMP 3350 · Algorithms/ })).toContainText(
		'Recommended for this term'
	);
	await expect(
		page.getByRole('button', { name: /COMP 2280 · Computer Organization/ })
	).toContainText("From Fall 2026. You didn't take it then.");
	await page.getByRole('button', { name: /HSS Elective/ }).click();
	await expect(page.getByText('Courses in Spring 2027 that count for this slot.')).toBeVisible();
	await expect(page.getByRole('button', { name: /PHIL 2100 · Ethics/ })).not.toContainText('Full');
	await expect(
		page.getByRole('button', { name: /PHIL 4401 · Ethics of Technology/ })
	).toContainText('Ethics · Prerequisites met · Full');
	await page.getByRole('button', { name: 'Courses', exact: true }).click();

	await page.getByRole('button', { name: 'Get started', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Which courses should we fit in?' })
	).toBeVisible();
	await expect(page.getByRole('checkbox', { name: /COMP 3350 · Algorithms/ })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: /HSS Elective/ })).toBeChecked();
	await expect(page.getByRole('heading', { name: 'Catch up' })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: /COMP 2280/ })).not.toBeChecked();
	await expect(status(page)).toHaveText('3 courses picked');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'How do you like your days?' })).toBeVisible();
	await page.getByText('Fewer, longer days').click();
	await expect(status(page)).toContainText('2 schedules match so far');
	for (const heading of [
		'When can you be in class?',
		'Want a weekday off?',
		'Breaks between classes?',
		'What about full sections?'
	]) {
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect(page.getByRole('heading', { name: heading })).toBeVisible();
	}
	await page.getByRole('button', { name: 'See 2 schedules', exact: true }).click();
	await expect(page).toHaveURL(/\/registration\/schedule(?:\.html)?$/);
	await expect(page.getByRole('heading', { name: /Best match · 1 of 2/ })).toBeVisible();
	await expect(page.getByText('COMP 3350-01 + L1, COMP 3450-01, PHIL 2100-01')).toBeVisible();
	await page.getByRole('button', { name: 'Next schedule' }).click();
	await expect(page.getByRole('heading', { name: /Option 2 · 2 of 2/ })).toBeVisible();
	await page.getByRole('button', { name: 'Previous schedule' }).click();
	await page.getByRole('button', { name: 'Use this schedule', exact: true }).click();
	await expect(page).toHaveURL(/\/registration(?:\.html)?$/);
	await expect(page.getByText('Schedule added. Tap a course to change its section.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible();
	await expect(page.getByText('3 courses · 12 credits').first()).toBeVisible();

	await page.getByRole('button', { name: 'View calendar', exact: true }).click();
	await expect(page).toHaveURL(/\/registration\/schedule(?:\.html)?$/);
	await page
		.getByRole('button', { name: /COMP 3350 Lab/ })
		.first()
		.click();
	const details = page.getByRole('dialog', { name: 'Section details' });
	await expect(details).toContainText('CRN: 20402');
	await details.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(details).toBeHidden();

	await chooseRadio(page, 'Courses');
	await page.getByRole('button', { name: /COMP 3350 · Algorithms/ }).click();
	await expect(page.getByRole('heading', { name: 'COMP 3350 · Algorithms' })).toBeVisible();
	await page.getByRole('radio', { name: /Section 02/ }).check();
	await expect(page.getByText(/Includes lab L3 .* CRN 20404/)).toBeVisible();
	await expect(
		page.getByText("Banner hasn't confirmed which lab goes with this section.")
	).toBeVisible();
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(page.getByRole('button', { name: /COMP 3350 · Algorithms/ })).toContainText(
		'Section 02 · Tue/Thu 10:00 – 11:15'
	);

	await page.getByRole('button', { name: 'Review', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Ready to register' })).toBeVisible();
	await expect(page.getByTitle('Copy CRN')).toHaveText(['20401', '20404', '20431', '20610']);
	await chooseRadio(page, 'Schedule');
	await expect(page.getByRole('button', { name: /COMP 3350 Lab/ }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Ready to register' })).toHaveCount(0);
	await chooseRadio(page, 'Courses');
	await expect(page.getByRole('heading', { name: 'Ready to register' })).toBeVisible();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
	expect(state.puts).toHaveLength(1);
	expect(state.puts[0].term).toBe('202620');
	expect(state.puts[0].body.courses).toEqual(saved.body.courses);
	expect(state.puts[0].body.preferences).toMatchObject({
		prefs: { days: 'fewer', openOnly: true },
		offMode: 'none'
	});
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible();

	await page.goto(extension.baseUrl + '/registration.html');
	await expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible();
	await expect(page.getByRole('button', { name: /COMP 3350 · Algorithms/ })).toContainText(
		'Section 02'
	);
	await expect(page.getByRole('button', { name: /PHIL 2100 · Ethics/ })).toBeVisible();
	await page.getByRole('button', { name: 'Review', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
	expect(state.puts).toHaveLength(1);
});

test('progress shows the missed warning, the timeline, details, HSS and the minor', async ({
	extension
}) => {
	const { page } = extension;
	await registration(extension);
	await extension.open('registration/progress');
	await expect(page.getByRole('heading', { name: 'Computer Science, B.S.' })).toBeVisible();
	await expect(page.getByText('Finish around').locator('..')).toContainText('Fall 2029');
	const missed = page.getByRole('button', { name: '2 courses from Fall 2026 not taken' });
	await expect(missed).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByRole('button', { name: 'Add to Spring 2027' })).toHaveCount(0);

	const spring = page
		.getByRole('listitem')
		.filter({ has: page.getByRole('button', { name: /^Spring 2027/ }) });
	await expect(spring.getByRole('button', { name: /^Spring 2027/ })).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	for (const code of ['COMP 2280', 'MATH 2500'])
		await expect(
			spring.getByRole('button', { name: `${code}: Not taken when planned` })
		).toBeVisible();
	await spring.getByRole('button', { name: 'COMP 3350: Not in your schedule yet' }).click();
	const detail = spring.getByRole('status');
	await expect(detail).toContainText('COMP 3350 · Algorithms');
	await expect(detail).toContainText('Designing and analyzing algorithms');

	const hss = page.locator('section').filter({
		has: page.getByRole('heading', { name: 'Humanities and social science' })
	});
	await expect(hss).toContainText('16 of 24 credits');
	await expect(hss.getByRole('listitem').filter({ hasText: 'Ethics' })).toContainText(
		'Planned Spring 2027'
	);

	await chooseRadio(page, 'Mathematics minor');
	await expect(page.getByRole('heading', { name: 'Mathematics Minor' })).toBeVisible();
	await expect(page.getByText('Fits in').locator('..')).toContainText('Summer 2028');
	await expect(page.getByRole('heading', { name: 'Upper-level Mathematics' })).toBeVisible();
	await chooseRadio(page, 'Major');

	await missed.click();
	await expect(missed).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText('COMP 2280 · Computer Organization')).toBeVisible();
	await page.getByRole('button', { name: 'Add to Spring 2027', exact: true }).click();
	await expect(page).toHaveURL(/\/registration(?:\.html)?$/);
	await expect(page.getByRole('heading', { name: 'Recommended for Spring 2027' })).toBeVisible();

	await buildSchedule(page);
	await chooseRadio(page, 'Progress');
	const timeline = page.locator('section').filter({
		has: page.getByRole('heading', { name: 'Plan by term' })
	});
	await timeline.getByRole('button', { name: 'Expand all' }).click();
	await expect(spring.getByRole('button', { name: /^Spring 2027/ })).toContainText(
		'3 of 5 in your schedule'
	);
	await expect(spring.getByRole('button', { name: 'PHIL 2100: In your schedule' })).toBeVisible();
	await expect(hss.getByRole('listitem').filter({ hasText: 'Ethics' })).toContainText(
		'in your Spring 2027 schedule'
	);
	const snapshot = () =>
		timeline.evaluate((element) => ({
			text: (element as HTMLElement).innerText,
			chips: Array.from(element.querySelectorAll('[aria-label]'), (chip) =>
				chip.getAttribute('aria-label')
			)
		}));
	const before = await snapshot();
	await expect(page.getByRole('radio', { name: 'Fall 2026', exact: true })).toHaveCount(0);
	await chooseRadio(page, 'Summer 2027');
	await expect(page.getByRole('radio', { name: 'Spring 2027', exact: true })).not.toBeChecked();
	await expect.poll(snapshot).toEqual(before);
	await chooseRadio(page, 'Spring 2027');
	await expect.poll(snapshot).toEqual(before);
});

test('builder busy, zero results, unpublished terms and fetch errors recover', async ({
	extension
}) => {
	const { page } = extension;
	const state = await registration(extension, { busy: 2 });
	await extension.open('registration');
	await page.getByRole('button', { name: 'Get started', exact: true }).click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(status(page)).toHaveText('Busy, try again in a moment');
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(status(page)).toContainText('2 schedules match so far');

	state.zero = true;
	await page.getByText('Fewer, longer days').click();
	await expect(status(page)).toHaveText('Nothing matches');
	const relax = page.getByRole('button', { name: /^Include full sections \(\d+ fit\)$/ });
	await expect(relax).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
	await relax.click();
	await expect(status(page)).toContainText(/\d+ schedules match so far/);
	await expect(relax).toHaveCount(0);
	state.zero = false;

	state.unpublished = true;
	await page.goto(extension.baseUrl + '/registration.html');
	await expect(page.getByRole('heading', { name: "Sections aren't posted yet" })).toBeVisible();
	await expect(page.getByText('COMP 3350 · Algorithms')).toBeVisible();
	await chooseRadio(page, 'Schedule');
	await expect(page.getByText("Sections for Spring 2027 aren't posted yet.")).toBeVisible();
	state.unpublished = false;

	state.fail = ['next_term_courses', 'registration_plans', 'sections', 'degree_progress'];
	await page.goto(extension.baseUrl + '/registration.html');
	const alert = page.getByRole('alert');
	for (const key of ['next_term_courses', 'registration_plans']) {
		await expect(alert).toContainText(`${key} is unavailable`);
		await alert.getByRole('button', { name: 'Try again' }).click();
	}
	await expect(page.getByRole('heading', { name: 'Recommended for Spring 2027' })).toBeVisible();
	await chooseRadio(page, 'Schedule');
	await expect(alert).toContainText('sections is unavailable');
	await alert.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByText('Your schedule shows up here once you add courses.')).toBeVisible();
	await chooseRadio(page, 'Progress');
	await expect(page.getByText("Couldn't load your progress")).toBeVisible();
	await expect(page.getByText('degree_progress is unavailable')).toBeVisible();
	await page.getByRole('button', { name: 'Try again' }).click();
	await expect(page.getByRole('heading', { name: 'Computer Science, B.S.' })).toBeVisible();

	state.plans['202620'] = saved;
	state.fail = ['schedule_check'];
	await page.goto(extension.baseUrl + '/registration.html');
	await expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible();
	await page.getByRole('button', { name: 'Review', exact: true }).click();
	await expect(alert).toContainText('schedule_check is unavailable');
	await alert.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Ready to register' })).toBeVisible();
	expect(state.fail).toEqual([]);
});

test('registration screens fit 360, 440 and 680 pixels in light and dark', async ({
	extension
}) => {
	const { page } = extension;
	await registration(extension, { plans: { '202620': saved } });
	await extension.open('registration');
	const screens: [string, () => Promise<void>][] = [
		[
			'Courses',
			() => expect(page.getByRole('heading', { name: 'Spring 2027 schedule' })).toBeVisible()
		],
		[
			'Schedule',
			async () => {
				await chooseRadio(page, 'Schedule');
				await expect(page.getByRole('button', { name: /COMP 3350 Lab/ }).first()).toBeVisible();
			}
		],
		[
			'Review',
			async () => {
				await page.getByRole('button', { name: 'Review', exact: true }).click();
				await expect(page.getByRole('heading', { name: 'Ready to register' })).toBeVisible();
			}
		],
		[
			'Progress',
			async () => {
				await chooseRadio(page, 'Progress');
				await expect(page.getByRole('heading', { name: 'Plan by term' })).toBeVisible();
			}
		]
	];
	for (const [name, show] of screens) {
		await show();
		for (const colorScheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme });
			for (const width of [360, 440, 680]) {
				await page.setViewportSize({ width, height: 800 });
				await test.step(`${name} ${colorScheme} ${width}`, () => fitsViewport(page));
			}
		}
	}
});
