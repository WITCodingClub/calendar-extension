<script lang="ts">
	import { API } from '$lib/api';
	import { processedData as storedProcessedData } from '$lib/store';
	import type { Course, DayItem } from '$lib/types';
	import { getPanelSession } from '$lib/panelSession';
	import { onMount, untrack } from 'svelte';
	import { getPanelUi } from '$lib/panelUi.svelte';
	const session = getPanelSession();
	const ui = getPanelUi();
	let { loadSchedules = false }: { loadSchedules?: boolean } = $props();
	const selected = $derived(ui.scheduleTerm);
	let schedulesLoadVersion = 0;
	let ownLoadingTerm: string | undefined;
	type RawFriendMeeting = {
		id?: number | string;
		begin_time: string;
		end_time: string;
		day_of_week?: string;
		start_date?: string;
		end_date?: string;
		monday?: boolean;
		tuesday?: boolean;
		wednesday?: boolean;
		thursday?: boolean;
		friday?: boolean;
		saturday?: boolean;
		sunday?: boolean;
		color?: string;
		title_overrides?: Partial<Record<DayItem['key'], string>>;
		location?: {
			building?: {
				name?: string;
				abbreviation?: string;
			};
			room?: string;
			rooms?: string[];
		};
	};

	type RawFriendCourse = {
		title: string;
		subject?: string;
		prefix?: string;
		course_number?: number | string;
		schedule_type?: string;
		professor?: {
			first_name?: string;
			last_name?: string;
			email?: string;
		};
		term?: {
			uid?: number | string;
			season?: string;
			year?: number | string;
		};
		instructors?: Array<{
			first_name?: string;
			last_name?: string;
			email?: string;
		}>;
		meeting_times?: RawFriendMeeting[];
	};

	function parseTimeToMinutes(timeStr: string): number {
		const trimmed = timeStr.trim();
		const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
		if (ampmMatch) {
			let hours = Number(ampmMatch[1]);
			const minutes = Number(ampmMatch[2]);
			const isPm = ampmMatch[3].toUpperCase() === 'PM';
			if (hours === 12) hours = 0;
			const total = hours + (isPm ? 12 : 0);
			return total * 60 + minutes;
		}
		const parts = trimmed.split(':');
		const h = Number(parts[0]);
		const m = Number(parts[1] ?? 0);
		return h * 60 + m;
	}

	function to24Hour(timeStr: string): string {
		const mins = parseTimeToMinutes(timeStr);
		return minutesToHHMM(mins);
	}

	function minutesToHHMM(total: number): string {
		const h = Math.floor(total / 60);
		const m = total % 60;
		return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
	}

	function mapFriendCourses(
		data: { processed_courses?: RawFriendCourse[]; classes?: RawFriendCourse[] },
		friendId: string
	): Course[] {
		const processedCourses = Array.isArray(data?.processed_courses)
			? (data.processed_courses as RawFriendCourse[])
			: Array.isArray(data?.classes)
				? data.classes
				: [];
		return processedCourses.map((c, ci: number) => ({
			title: c.title,
			prefix: c.subject ?? c.prefix ?? '',
			course_number: Number(c.course_number ?? 0),
			schedule_type: c.schedule_type ?? '',
			term: {
				uid: Number(c.term?.uid ?? 0),
				season: c.term?.season ?? '',
				year: Number(c.term?.year ?? 0)
			},
			professor: {
				first_name: c.professor?.first_name ?? c.instructors?.[0]?.first_name ?? '',
				last_name: c.professor?.last_name ?? c.instructors?.[0]?.last_name ?? '',
				email: c.professor?.email ?? c.instructors?.[0]?.email ?? ''
			},
			meeting_times: (Array.isArray(c.meeting_times) ? c.meeting_times : []).map(
				(m, mi: number) => {
					const begin = to24Hour(m.begin_time);
					const end = to24Hour(m.end_time);
					const dayKey = String(m.day_of_week ?? '').toLowerCase() as DayItem['key'];
					const hasDayFlags =
						m.monday !== undefined ||
						m.tuesday !== undefined ||
						m.wednesday !== undefined ||
						m.thursday !== undefined ||
						m.friday !== undefined ||
						m.saturday !== undefined ||
						m.sunday !== undefined;
					const mappedRooms = m.location?.rooms;
					return {
						id: m.id ?? `${friendId}-${ci}-${mi}-${dayKey}`,
						begin_time: begin,
						end_time: end,
						start_date: m.start_date ?? '',
						end_date: m.end_date ?? '',
						location: {
							building: {
								name: m.location?.building?.name ?? '',
								abbreviation: m.location?.building?.abbreviation ?? ''
							},
							rooms: Array.isArray(mappedRooms)
								? mappedRooms
								: m.location?.room
									? [m.location.room]
									: []
						},
						monday: hasDayFlags ? Boolean(m.monday) : dayKey === 'monday',
						tuesday: hasDayFlags ? Boolean(m.tuesday) : dayKey === 'tuesday',
						wednesday: hasDayFlags ? Boolean(m.wednesday) : dayKey === 'wednesday',
						thursday: hasDayFlags ? Boolean(m.thursday) : dayKey === 'thursday',
						friday: hasDayFlags ? Boolean(m.friday) : dayKey === 'friday',
						saturday: hasDayFlags ? Boolean(m.saturday) : dayKey === 'saturday',
						sunday: hasDayFlags ? Boolean(m.sunday) : dayKey === 'sunday',
						color: m.color,
						title_overrides: m.title_overrides
					};
				}
			)
		}));
	}

	async function loadFriendsAndRequests(useCachedFriends = false) {
		ui.friendError = '';
		const cachedFriends = useCachedFriends ? session.friends : undefined;
		if (cachedFriends) {
			ui.friends = cachedFriends;
		}
		ui.friendsLoading = !cachedFriends;
		ui.requestsLoading = true;
		try {
			const [friendsResponse, requestsResponse] = await Promise.all([
				cachedFriends ? Promise.resolve(undefined) : API.getFriends(),
				API.getFriendRequests()
			]);
			if (friendsResponse) {
				const friends = friendsResponse.friends ?? [];
				ui.friends = friends;
				session.friends = friends;
			}
			ui.incomingRequests = requestsResponse.incoming ?? [];
			if (!session.active) return;
			ui.outgoingRequests = requestsResponse.outgoing ?? [];
			const ids = new Set(['you', ...ui.friends.map((friend) => friend.id)]);
			ui.selected = ui.selected.filter((id) => ids.has(id));
			ui.groups = ui.groups.map((group) => ({
				...group,
				members: group.members.filter((id) => ids.has(id))
			}));
			for (const term of Object.keys(ui.friendSchedules)) {
				for (const id of Object.keys(ui.friendSchedules[term])) {
					if (!ids.has(id)) {
						delete ui.friendSchedules[term][id];
						delete session.schedules[term]?.[id];
						delete ui.scheduleStatus[term]?.[id];
					}
				}
			}
		} catch (error) {
			console.error('Failed to load friends data', error);
			ui.friendError = 'Failed to load friends data.';
		} finally {
			ui.friendsLoading = false;
			ui.requestsLoading = false;
		}
	}

	async function loadFriendSchedules(termUid: string) {
		const loadVersion = ++schedulesLoadVersion;
		const cachedSchedules = (session.schedules[termUid] ??= {});
		// Only friends without a cached schedule for this term need a request.
		const friends = ui.friends.filter((friend) => ui.selected.includes(friend.id));
		ui.friendSchedules[termUid] ??= {};
		ui.scheduleStatus[termUid] ??= {};
		try {
			const coursesByFriend = await Promise.all(
				friends.map(async (friend) => {
					const cachedCourses = cachedSchedules[friend.id];
					if (cachedCourses) {
						ui.friendSchedules[termUid][friend.id] = cachedCourses;
						ui.scheduleStatus[termUid][friend.id] = 'loaded';
						return { id: friend.id, courses: cachedCourses };
					}
					ui.scheduleStatus[termUid][friend.id] = 'loading';
					try {
						const response = await API.getFriendProcessedEvents(friend.id, termUid);
						const courses = mapFriendCourses(response, friend.id);
						if (!session.active || !ui.friends.some((person) => person.id === friend.id))
							return { id: friend.id, courses: [] as Course[] };
						ui.friendSchedules[termUid][friend.id] = courses;
						cachedSchedules[friend.id] = courses;
						ui.scheduleStatus[termUid][friend.id] = 'loaded';
						return { id: friend.id, courses };
					} catch (error) {
						// Failed and unprocessed schedules are not cached. The friend
						// can finish setup later, so the next visit asks again.
						try {
							const status = await API.friendIsProcessed(friend.id, termUid);
							if (!status.processed) {
								ui.scheduleStatus[termUid][friend.id] = 'unprocessed';
								return { id: friend.id, courses: [] as Course[] };
							}
						} catch (statusError) {
							console.error(`Failed to check processed status for ${friend.id}`, statusError);
						}
						console.error(`Failed to load schedule for ${friend.id}`, error);
						ui.scheduleStatus[termUid][friend.id] = 'error';
						return { id: friend.id, courses: [] as Course[] };
					}
				})
			);
			if (loadVersion !== schedulesLoadVersion) return;
			if (!session.active) return;
			for (const friend of coursesByFriend) ui.friendSchedules[termUid][friend.id] = friend.courses;
		} finally {
			if (loadVersion === schedulesLoadVersion && !session.active) ++schedulesLoadVersion;
		}
	}

	async function loadOwnSchedule(term: string) {
		if (
			$storedProcessedData.some((item) => String(item.termId) === term) ||
			ownLoadingTerm === term
		)
			return;
		ownLoadingTerm = term;
		try {
			const response = await API.getProcessedEvents(term);
			if (!session.active) return;
			if (!Array.isArray(response.classes))
				throw new Error('No processed class schedule was returned.');
			storedProcessedData.update((data) =>
				data.some((item) => String(item.termId) === term)
					? data
					: [
							...data,
							{
								termId: term,
								responseData: { classes: response.classes, ics_url: '' }
							}
						]
			);
		} catch (error) {
			console.error('Failed to load your schedule', error);
		}
	}

	async function sendFriendRequest() {
		const value = ui.sendFriendIdInput.trim();
		if (!value) return;
		ui.actionLoadingId = 'send-request';
		ui.friendError = '';
		try {
			const isEmail = value.includes('@');
			await API.createFriendRequest(isEmail ? { friend_email: value } : { friend_id: value });
			ui.sendFriendIdInput = '';
			await loadFriendsAndRequests();
		} catch (error) {
			console.error('Failed to send friend request', error);
			ui.friendError = error instanceof Error ? error.message : 'Failed to send friend request.';
		} finally {
			ui.actionLoadingId = '';
		}
	}

	async function acceptRequest(requestId: string) {
		ui.actionLoadingId = `accept-${requestId}`;
		ui.friendError = '';
		try {
			await API.acceptFriendRequest(requestId);
			await loadFriendsAndRequests();
			if (selected) {
				await loadFriendSchedules(selected);
			}
		} catch (error) {
			console.error('Failed to accept request', error);
			ui.friendError = 'Failed to accept request.';
		} finally {
			ui.actionLoadingId = '';
		}
	}

	async function declineRequest(requestId: string) {
		ui.actionLoadingId = `decline-${requestId}`;
		ui.friendError = '';
		try {
			await API.declineFriendRequest(requestId);
			await loadFriendsAndRequests();
		} catch (error) {
			console.error('Failed to decline request', error);
			ui.friendError = 'Failed to decline request.';
		} finally {
			ui.actionLoadingId = '';
		}
	}

	async function cancelRequest(requestId: string) {
		ui.actionLoadingId = `cancel-${requestId}`;
		ui.friendError = '';
		try {
			await API.cancelFriendRequest(requestId);
			await loadFriendsAndRequests();
		} catch (error) {
			console.error('Failed to cancel request', error);
			ui.friendError = 'Failed to cancel request.';
		} finally {
			ui.actionLoadingId = '';
		}
	}

	async function unfriend(friendId: string) {
		ui.actionLoadingId = `unfriend-${friendId}`;
		ui.friendError = '';
		try {
			await API.removeFriend(friendId);
			await loadFriendsAndRequests();
			if (selected) {
				await loadFriendSchedules(selected);
			}
		} catch (error) {
			console.error('Failed to remove friend', error);
			ui.friendError = 'Failed to remove friend.';
		} finally {
			ui.actionLoadingId = '';
		}
	}

	onMount(async () => {
		try {
			// The calendar page may already have loaded the terms in this session.
			const terms = await session.loadTerms();
			const current = terms.current_term ?? terms.next_term;
			ui.currentTerm = current?.id != null ? String(current.id) : ui.term;
			for (const term of [terms.current_term, terms.next_term]) {
				if (term)
					ui.termBounds[String(term.id)] = {
						start: term.start_date?.slice(0, 10),
						end: term.end_date?.slice(0, 10)
					};
			}
			ui.term ??= ui.currentTerm;
		} catch (error) {
			// Without the terms the page cannot pick a term, but the friend
			// list and the requests below still load.
			console.error('Failed to load terms', error);
		}
		await loadFriendsAndRequests(true);
	});

	ui.friendActions = {
		reload: () => loadFriendsAndRequests(),
		retrySchedules: async () => {
			if (selected) {
				ownLoadingTerm = undefined;
				await Promise.all([loadFriendSchedules(selected), loadOwnSchedule(selected)]);
			}
		},
		send: sendFriendRequest,
		accept: acceptRequest,
		decline: declineRequest,
		cancel: cancelRequest,
		remove: unfriend
	};
	$effect(() => {
		const term = selected;
		const ids = ui.selected.join(',');
		const friends = ui.friends;
		if (!loadSchedules || !term || !ids || !friends) return;
		untrack(() => {
			void loadFriendSchedules(term);
			if (ui.selected.includes('you')) void loadOwnSchedule(term);
		});
	});
	$effect(() => {
		if (ui.manageOpen)
			untrack(() => {
				void loadFriendsAndRequests();
			});
	});
</script>
