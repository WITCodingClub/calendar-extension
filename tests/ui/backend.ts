// Synthetic backend boundary. These are source contracts, not a live login.
export const now = '2026-10-06T12:00:00-04:00';
export const origin = 'https://staging-calendar.witcc.dev';
export const friends = [
	{ id: 'friend-ada', name: 'Ada Test', visibility: { mine: 'full', theirs: 'full' } },
	{ id: 'friend-ben', name: 'Ben Test', visibility: { mine: 'full', theirs: 'full' } },
	{ id: 'friend-cam', name: 'Cam Test', visibility: { mine: 'full', theirs: 'full' } }
];
export const terms = {
	current_term: { id: 202610, name: 'Fall 2026', start_date: '2026-09-01', end_date: '2026-12-20' },
	next_term: null
};
export const settings = {
	military_time: true,
	default_color_lecture: '#3f51b5',
	default_color_lab: '#0b8043',
	advanced_editing: false,
	sync_university_events: false,
	university_event_categories: [],
	show_historic_terms: false,
	enrolled_terms: [{ id: '202610', name: 'Fall 2026' }]
};
function course(title: string, id: string, start: string, end: string) {
	return {
		title,
		prefix: 'TEST',
		course_number: 101,
		schedule_type: 'Lecture',
		term: { uid: 202610, season: 'Fall', year: 2026 },
		professor: { first_name: 'Test', last_name: 'Instructor', email: 'instructor@example.invalid' },
		meeting_times: [
			{
				id,
				begin_time: start,
				end_time: end,
				start_date: '2026-09-01',
				end_date: '2026-12-20',
				monday: true,
				tuesday: true,
				wednesday: true,
				thursday: true,
				friday: true,
				saturday: false,
				sunday: false,
				location: { building: { name: 'Test Hall', abbreviation: 'TH' }, rooms: ['101'] }
			}
		]
	};
}
export const ownCourses = [
	course('Algorithms Test', 'own-1', '09:00', '10:00'),
	course('Systems Test', 'own-2', '14:00', '15:00')
];
export const schedules = Object.fromEntries(
	friends.map((friend, i) => [
		friend.id,
		[
			course(
				`${friend.name.split(' ')[0]} Class`,
				`meeting-${friend.id}`,
				i === 1 ? '10:30' : '09:30',
				i === 1 ? '11:30' : '10:30'
			)
		]
	])
);
export function preference(id: string) {
	const title = ownCourses.find((c) => c.meeting_times[0].id === id)?.title ?? 'Test class';
	return {
		notifications_disabled: false,
		individual_preference: null,
		preview: { title, description: 'Synthetic course', location: 'Test Hall 101' },
		templates: { title, course_code: 'TEST 101', schedule_type: 'Lecture' },
		resolved: {
			title_template: '{{title}}',
			description_template: '',
			location_template: '',
			color_id: '#3f51b5',
			reminder_settings: [],
			visibility: 'default'
		}
	};
}
export function responseFor(
	method: string,
	path: string,
	body: Record<string, unknown> | null,
	query = new URLSearchParams()
) {
	if (method === 'GET') {
		if (/^\/api\/(?:user|friends\/[^/]+)\/busy_blocks$/.test(path)) {
			const start = query.get('start_date')!;
			const end = query.get('end_date')!;
			const courses = path.includes('/user/') ? ownCourses : schedules[path.split('/')[3]];
			const busy = [];
			for (
				const date = new Date(start + 'T00:00:00Z');
				date <= new Date(end + 'T00:00:00Z');
				date.setUTCDate(date.getUTCDate() + 1)
			) {
				const weekday = [
					'sunday',
					'monday',
					'tuesday',
					'wednesday',
					'thursday',
					'friday',
					'saturday'
				][date.getUTCDay()];
				if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
				for (const course of courses ?? [])
					for (const meeting of course.meeting_times)
						busy.push({
							date: date.toISOString().slice(0, 10),
							weekday,
							start: meeting.begin_time,
							end: meeting.end_time
						});
			}
			return { time_zone: 'America/New_York', start_date: start, end_date: end, busy };
		}
		switch (path) {
			case '/api/user/preferences/version':
				return { version: 'a'.repeat(64) };
			case '/api/terms/current_and_next':
				return terms;
			case '/api/user/extension_config':
				return settings;
			case '/api/user/feature_flags':
				return {
					feature_flags: {
						debugMode: false,
						envSwitcher: false,
						finalsRetroactive: false,
						bypassRateLimits: false
					}
				};
			case '/api/friends':
				return { friends };
			case '/api/friends/groups':
				return { groups: [] };
			case '/api/meeting_links':
				return { meeting_links: [] };
			case '/api/friends/requests':
				return {
					incoming: [
						{
							request_id: 'request-in',
							from: { id: 'friend-in', name: 'Incoming Test' },
							created_at: now
						}
					],
					outgoing: [
						{
							request_id: 'request-out',
							to: { id: 'friend-out', name: 'Outgoing Test' },
							created_at: now
						}
					]
				};
			case '/api/user/email':
				return { email: 'primary@example.invalid' };
			case '/api/user/notifications_status':
				return { notifications_disabled: false, notifications_disabled_until: null };
			case '/api/user/oauth_credentials':
				return { oauth_credentials: [] };
			case '/api/user/passkeys':
				return { passkeys: [] };
			case '/api/calendar_preferences':
				return { global: null, uni_cal_global: null, event_types: {}, uni_cal_categories: {} };
			case '/api/university_calendar_events/holidays':
				return { holidays: [] };
			case '/api/university_calendar_events/categories':
				return { categories: [] };
			case '/api/user/ics_url':
				return { ics_url: 'https://example.invalid/synthetic.ics' };
		}
		const match = path.match(/^\/api\/meeting_times\/(own-[12])\/preference$/);
		if (match) return preference(match[1]);
	}
	if (method === 'POST') {
		if (path === '/api/meeting_times/preferences' && Array.isArray(body?.meeting_time_ids))
			return {
				version: 'a'.repeat(64),
				preferences: Object.fromEntries(
					body.meeting_time_ids.map((id) => [String(id), preference(String(id))])
				)
			};
		if (body?.term_uid !== '202610') return undefined;
		if (path === '/api/user/is_processed') return { processed: true };
		if (path === '/api/user/processed_events') return { classes: ownCourses };
		const match = path.match(
			/^\/api\/friends\/(friend-(?:ada|ben|cam))\/(is_processed|processed_events)$/
		);
		if (match)
			return match[2] === 'is_processed'
				? { processed: true }
				: { classes: schedules[match[1]], notifications_disabled: false };
	}
	return undefined;
}
