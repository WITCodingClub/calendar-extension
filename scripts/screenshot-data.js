export function createResponses(data) {
	const classes = data.classes ?? [];
	const term = data.term ??
		classes[0]?.term ?? {
			id: 202610,
			name: 'Fall 2026',
			start_date: '2026-09-01',
			end_date: '2026-12-20'
		};
	const termId = term.uid ?? term.id;
	const settings = {
		military_time: false,
		default_color_lecture: '#3f51b5',
		default_color_lab: '#0b8043',
		advanced_editing: false,
		sync_university_events: false,
		university_event_categories: [],
		show_historic_terms: false,
		enrolled_terms: [{ id: String(termId), name: term.name }],
		...data.settings
	};
	const preferences = Object.fromEntries(
		classes.flatMap((course) =>
			course.meeting_times.map((meeting) => {
				const config = meeting.calendar_config ?? {};
				return [
					meeting.id,
					{
						notifications_disabled: false,
						individual_preference: null,
						preview: {
							title: config.title ?? course.title,
							description: config.description ?? '',
							location: meeting.building_room ?? ''
						},
						templates: {
							title: course.title,
							course_code: course.prefix ?? course.subject ?? '',
							course_number: String(course.course_number ?? ''),
							section_number: course.section_number ?? '',
							faculty: [course.professor?.first_name, course.professor?.last_name]
								.filter(Boolean)
								.join(' '),
							faculty_email: course.professor?.email ?? '',
							building: meeting.location?.building?.name ?? '',
							room: meeting.location?.rooms?.join(', ') ?? '',
							term: course.term?.name ?? term.name,
							schedule_type: course.schedule_type
						},
						resolved: {
							title_template: config.title ?? '{{title}}',
							description_template: config.description ?? '',
							location_template: meeting.building_room ?? '',
							color_id:
								config.color_id ??
								(/^(laboratory|lab)$/i.test(course.schedule_type ?? '')
									? settings.default_color_lab
									: settings.default_color_lecture),
							reminder_settings: (config.reminder_settings ?? []).map((reminder) => ({
								...reminder,
								method: reminder.method === 'popup' ? 'notification' : reminder.method
							})),
							visibility: config.visibility ?? 'default'
						}
					}
				];
			})
		)
	);
	const responses = {
		'GET /up': { status: 'ok' },
		'GET /api/user': {
			pub_id: 'screenshot-user',
			email: 'sample@example.invalid',
			ics_url: 'https://example.invalid/sample.ics'
		},
		'GET /api/v1/catalog/terms/current': {
			data: {
				...term,
				uid: termId,
				season: term.season ?? term.name.split(' ')[0],
				year: term.year ?? Number(term.name.split(' ')[1])
			}
		},
		'GET /api/v1/catalog/terms/next': null,
		'GET /api/user/extension_config': settings,
		'GET /api/user/processed_events/status': { processed: true },
		'GET /api/user/processed_events': { classes },
		'GET /api/user/preferences/version': { version: 'a'.repeat(64) },
		'GET /api/user/feature_flags': { feature_flags: {} },
		'GET /api/user/notifications': {
			notifications_disabled: false,
			notifications_disabled_until: null
		},
		'GET /api/user/oauth_credentials': { oauth_credentials: [] },
		'GET /api/user/passkeys': { passkeys: [] },
		'GET /api/calendar_preferences': {
			global: null,
			uni_cal_global: null,
			event_types: {},
			uni_cal_categories: {}
		},
		'GET /api/university_calendar_events/holidays': { holidays: [] },
		'GET /api/university_calendar_events/categories': { categories: [] },
		'GET /api/friends': { friends: [] },
		'GET /api/friends/groups': { groups: [] },
		'GET /api/friends/requests': { incoming: [], outgoing: [] },
		'GET /api/friends/meetings': { meetings: [], occurrences: [] },
		'GET /api/meeting_links': { meeting_links: [] },
		...data.responses
	};
	return (method, pathname, body) => {
		const key = `${method} ${pathname}`;
		if (Object.hasOwn(responses, key)) return responses[key];
		if (method === 'POST' && pathname === '/api/meeting_times/preferences')
			return {
				version: 'a'.repeat(64),
				preferences: Object.fromEntries(
					(body?.meeting_time_ids ?? []).map((id) => [id, preferences[id]])
				)
			};
		const match = pathname.match(/^\/api\/meeting_times\/([^/]+)\/preference$/);
		if (method === 'GET' && match) return preferences[match[1]];
	};
}
