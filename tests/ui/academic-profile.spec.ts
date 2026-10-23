import { test, expect } from './extension.fixture';
import { lookupAcademicProfile, STUDENT_PROFILE_URL } from '../../src/lib/calendar/academicProfile';
import { STUDENT_GRADES_URL } from '../../src/lib/calendar/courseOutcomes';
import { chooseRadio, fitsViewport } from './helpers';
import { origin } from './backend';

test('backfill flags load once across panel navigation and reload for a changed session', async ({
	extension
}) => {
	const { page, network, worker } = extension;
	await extension.open('calendar');
	await expect
		.poll(() => network.filter((row) => row.path === '/api/user/backfills').length)
		.toBe(1);
	await chooseRadio(page, 'Settings');
	await expect(page.getByText(/primary@example.invalid/)).toBeVisible();
	expect(network.filter((row) => row.path === '/api/user/backfills')).toHaveLength(1);
	await worker.evaluate(async () => {
		const { environment_data: data } = await chrome.storage.local.get('environment_data');
		data.jwt_tokens.staging += '-new-session';
		await chrome.storage.local.set({ environment_data: data });
	});
	await expect
		.poll(() => network.filter((row) => row.path === '/api/user/backfills').length)
		.toBe(2);
});

test('a failed backfill-state read recovers through Retry', async ({ extension }) => {
	let fail = true;
	await extension.context.route(`${origin}/api/user/backfills`, async (route) => {
		if (!fail) return route.fallback();
		fail = false;
		await route.fulfill({ status: 503, json: { error: 'Backfill state unavailable' } });
	});
	await extension.open('settings');
	const notice = extension.page
		.getByRole('status')
		.filter({ hasText: 'Course history and academic sync did not finish.' });
	await expect(notice).toContainText('Backfill state unavailable');
	await notice.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect
		.poll(() => extension.network.filter((row) => row.path === '/api/user/backfills').length)
		.toBe(1);
	await expect(notice).not.toBeVisible();
});

const rows = [
	['Degree', 'Bachelor of Science'],
	['Study Path', 'Not Provided'],
	['Level', 'Undergraduate'],
	['Program', 'Computer Science (BCOS)'],
	['College', 'The School of Comp &amp; Data Sci'],
	['Major', 'Computer Science'],
	['Department', 'Computer Science &amp; Networking'],
	['Concentration', 'Not Provided'],
	['Minor', 'Not Provided'],
	['Concentration', 'Not Provided'],
	['Admit Type', 'Freshman Admit (Domestic)'],
	['Admit Term', 'Fall 2025'],
	['Catalog Term', 'Fall 2025']
];

function html(values = rows) {
	return `<div id="primary-curriculum-details"><h2 class="sr-only">Primary tab content loaded.</h2>${values.map(([label, value]) => `<div class="row no-margin"><strong class="col-lg-3 col-md-5 col-sm-5 col-xs-6">${label}:</strong><span class="col-sm-6 col-xs-6">${value}</span></div>`).join('')}</div>`;
}

const expected = {
	source: 'leopardweb',
	level: 'Undergraduate',
	class_standing: null,
	admit_type: 'Freshman Admit (Domestic)',
	admit_term: 'Fall 2025',
	programs: [
		{
			role: 'major',
			code: 'BCOS',
			degree: 'Bachelor of Science',
			college: 'The School of Comp & Data Sci',
			name: 'Computer Science',
			department: 'Computer Science & Networking',
			concentration: null,
			study_path: null,
			catalog_term: 'Fall 2025'
		}
	]
};

test('grade AJAX sign-in failures recover through Sign in and Retry without replacing user tabs', async ({
	extension
}) => {
	const { context, page, worker } = extension;
	extension.allowedProbeHosts.add('selfservice.wit.edu');
	const writes: string[] = [];
	const state = {
		past_terms: { completed: true, completed_at: '2026-10-06T16:00:00Z' },
		academic_data: { completed: false, completed_at: null as string | null }
	};
	await context.route(`${origin}/api/user/backfills`, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		await route.fulfill({ json: state });
	});
	for (const path of ['academic_profile', 'backfills/academic_data']) {
		await context.route(`${origin}/api/user/${path}`, async (route) => {
			if (route.request().method() !== 'PUT') return route.fallback();
			writes.push(path);
			if (path === 'backfills/academic_data')
				state.academic_data = { completed: true, completed_at: '2026-10-06T16:00:00Z' };
			const body = route.request().postDataJSON();
			if (path === 'academic_profile') expect(body).toEqual(expected);
			await route.fulfill({
				json:
					path === 'academic_profile'
						? {
								...expected,
								programs: expected.programs.map((program) => ({ ...program, matched: true }))
							}
						: state
			});
		});
	}
	await context.route(STUDENT_PROFILE_URL.split('#')[0], async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		await route.fulfill({ contentType: 'text/html', body: html() });
	});
	let gradeVisits = 0;
	await context.route(STUDENT_GRADES_URL, async (route) => {
		if (route.request().method() !== 'GET') return route.fallback();
		gradeVisits++;
		await route.fulfill({
			contentType: 'text/html',
			body: `<h1>${gradeVisits > 1 ? 'Synthetic sign-in complete' : 'Student Grades'}</h1>`
		});
	});
	await context.route(
		'https://selfservice.wit.edu/StudentSelfService/studentGrades/*',
		async (route) => {
			const name = new URL(route.request().url()).pathname.split('/').at(-1);
			if (
				route.request().method() !== 'GET' ||
				!['term', 'level', 'gpa', 'courses'].includes(name!)
			)
				return route.fallback();
			await route.fulfill({
				status: gradeVisits === 1 ? 401 : 200,
				json: name === 'courses' ? { success: true, totalCount: 0, pageOffset: '0', data: [] } : {}
			});
		}
	);
	const profile = await context.newPage();
	await profile.goto(STUDENT_PROFILE_URL);
	const grades = await context.newPage();
	await grades.goto(STUDENT_GRADES_URL);
	const initialTabs = context.pages();
	await page.bringToFront();
	await page.setViewportSize({ width: 320, height: 900 });
	await extension.open('settings');
	const notice = page
		.getByRole('status')
		.filter({ hasText: 'Course history and academic sync did not finish.' });
	await expect(notice).toBeVisible();
	await fitsViewport(page, notice);
	expect(writes).toEqual([]);
	expect(
		await worker.evaluate(async () =>
			(await chrome.tabs.query({ active: true })).map((tab) => tab.url)
		)
	).toEqual([`${extension.baseUrl}/settings.html`]);
	await notice.getByRole('button', { name: 'Sign in to LeopardWeb', exact: true }).click();
	await expect(grades.getByRole('heading', { name: 'Synthetic sign-in complete' })).toBeVisible();
	await expect(notice).toContainText('After signing in, return here and select Retry.');
	await page.bringToFront();
	await notice.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect.poll(() => writes).toEqual(['academic_profile', 'backfills/academic_data']);
	await expect(notice).not.toBeVisible();
	expect(context.pages()).toEqual(initialTabs);
	expect(profile.isClosed() || grades.isClosed()).toBe(false);
	await expect(profile).toHaveURL(STUDENT_PROFILE_URL);
	await expect(grades).toHaveURL(STUDENT_GRADES_URL);
	expect(extension.proxyDenied).toContain('selfservice.wit.edu');
});

test('extracts a private-field-free profile despite an empty secondary placeholder', async ({
	extension
}) => {
	const primary = html([
		...rows,
		['GPA', 'private'],
		['Grade', 'private'],
		['Student ID', 'private']
	]);
	for (const secondary of [
		'<div id="secondary-curriculum-details"></div>',
		'<div id="secondary-curriculum-details"><div class="row"><strong>Major:</strong><span>Not Provided</span></div></div>'
	]) {
		await extension.page.setContent(primary + secondary);
		expect(await extension.page.evaluate(lookupAcademicProfile)).toEqual({ profile: expected });
	}
});

test('major and minor concentrations remain separate and text whitespace is normalized', async ({
	extension
}) => {
	const values = rows.map((row) => [...row]);
	values[1][1] = '  Specialized   Study  ';
	values[7][1] = '  Artificial \n Intelligence ';
	values[8][1] = 'Computer Networking';
	values[9][1] = 'Network Security';
	await extension.page.setContent(html(values));
	expect(await extension.page.evaluate(lookupAcademicProfile)).toEqual({
		profile: {
			...expected,
			programs: [
				{
					...expected.programs[0],
					study_path: 'Specialized Study',
					concentration: 'Artificial Intelligence'
				},
				{
					role: 'minor',
					code: null,
					name: 'Computer Networking',
					degree: null,
					college: null,
					department: null,
					concentration: 'Network Security',
					study_path: null,
					catalog_term: 'Fall 2025'
				}
			]
		}
	});
});

test('includes a rendered secondary curriculum in the full program list', async ({ extension }) => {
	const secondary = rows.map(([label, value]) => [
		label,
		label === 'Major'
			? 'Applied Mathematics'
			: label === 'Program'
				? 'Applied Mathematics (BAM)'
				: value
	]);
	await extension.page.setContent(
		html() + html(secondary).replace('primary-curriculum-details', 'secondary-curriculum-details')
	);
	expect(await extension.page.evaluate(lookupAcademicProfile)).toEqual({
		profile: {
			...expected,
			programs: [
				expected.programs[0],
				{ ...expected.programs[0], name: 'Applied Mathematics', code: 'BAM' }
			]
		}
	});
});

test('missing optional program and catalog labels are sent as null', async ({ extension }) => {
	await extension.page.setContent(
		html(rows.filter(([label]) => !['Program', 'Catalog Term'].includes(label)))
	);
	expect(await extension.page.evaluate(lookupAcademicProfile)).toEqual({
		profile: {
			...expected,
			programs: [{ ...expected.programs[0], code: null, catalog_term: null }]
		}
	});
});

test('waits for asynchronously rendered curriculum rows', async ({ extension }) => {
	const { page } = extension;
	await page.setContent('<div id="primary-curriculum-details"></div>');
	const result = page.evaluate(lookupAcademicProfile);
	await page.locator('#primary-curriculum-details').evaluate((root, content) => {
		root.outerHTML = content;
	}, html());
	expect(await result).toEqual({ profile: expected });
});

test('missing or incomplete curriculum returns a bounded error', async ({ extension }) => {
	const { page } = extension;
	await page.clock.install();
	for (const content of [
		'<form>Sign in to LeopardWeb</form>',
		html(rows.filter(([label]) => label !== 'Major'))
	]) {
		await page.setContent(content);
		const result = page.evaluate(lookupAcademicProfile);
		await expect
			.poll(() =>
				page.evaluate(() => document.querySelector('#primary-curriculum-details') !== null)
			)
			.toBe(content.includes('primary-curriculum-details'));
		await page.clock.runFor(15_001);
		expect(await result).toEqual({ error: expect.stringContaining('student profile page loaded') });
	}
});
