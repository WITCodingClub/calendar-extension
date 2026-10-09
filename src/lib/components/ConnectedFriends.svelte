<script lang="ts">
	import { API, ApiError } from '$lib/api';
	import { busyRangeKey, validBusyRange } from '$lib/friendSchedule';
	import { calendarDateTime, shiftDate } from '$lib/calendarDates';
	import { processedData as storedProcessedData } from '$lib/store';
	import type { Course, SharingLevel } from '$lib/types';
	import { mapFriendCourses, validateCourses, validateTermBounds } from '$lib/friendSchedule';
	import { friendRequestErrorMessage, requestInputMessage } from '$lib/friendData';
	import { getPanelSession } from '$lib/panelSession';
	import { snackbar } from 'm3-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { onMount, untrack } from 'svelte';
	import { getPanelUi } from '$lib/panelUi.svelte';
	const session = getPanelSession();
	const ui = getPanelUi();
	let { loadSchedules = false }: { loadSchedules?: boolean } = $props();
	const selected = $derived(ui.scheduleTerm);
	const friendIds = $derived(
		ui.friends
			.map((friend) => `${friend.id}:${friend.visibility?.theirs}:${friend.expires_at}`)
			.join(',')
	);
	let friendsVersion = 0;
	let requestsVersion = 0;
	let termsVersion = 0;
	let groupsVersion = 0;
	const inFlight = new SvelteMap<string, Promise<void>>();
	const busyInFlight = new Map<string, Promise<void>>();
	const generations: Record<string, number> = {};
	const waiting: Array<() => void> = [];
	let running = 0;

	function report(message: string) {
		snackbar(message, undefined, true);
	}

	function errorMessage(operation: string, error: unknown, retry: string) {
		return `${operation}: ${error instanceof Error ? error.message : 'Request failed'}. ${retry}`;
	}

	async function withScheduleSlot(action: () => Promise<void>) {
		if (running >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
		else ++running;
		try {
			await action();
		} finally {
			const next = waiting.shift();
			if (next) next();
			else --running;
		}
	}

	function discardBusy(id: string) {
		session.invalidateBusyBlocks(id);
		for (const range of new Set([...Object.keys(ui.busyBlocks), ...Object.keys(ui.busyStatus)])) {
			delete ui.busyBlocks[range]?.[id];
			delete ui.busyStatus[range]?.[id];
			delete ui.busyErrors[range]?.[id];
		}
		++ui.busyVersion;
	}

	function discardFriend(id: string) {
		discardBusy(id);
		for (const term of new Set([
			...Object.keys(ui.friendSchedules),
			...Object.keys(session.schedules),
			...Object.keys(ui.scheduleStatus)
		])) {
			const key = `${term}:${id}`;
			generations[key] = (generations[key] ?? 0) + 1;
			inFlight.delete(key);
			delete ui.friendSchedules[term]?.[id];
			delete session.schedules[term]?.[id];
			delete ui.scheduleStatus[term]?.[id];
			delete ui.scheduleErrors[term]?.[id];
		}
	}

	async function handleAccessError(id: string, error: unknown): Promise<boolean> {
		if (
			id === 'you' ||
			!(error instanceof ApiError) ||
			!['AVAILABILITY_ONLY', 'NOT_FRIENDS'].includes(error.code ?? '')
		)
			return false;
		discardFriend(id);
		if (error.code === 'NOT_FRIENDS') {
			ui.invalidateMeetings(session);
			++friendsVersion;
			ui.friendsLoading = false;
			ui.friends = ui.friends.filter((person) => person.id !== id);
			session.friends = ui.friends;
			ui.selected = ui.selected.filter((person) => person !== id);
			ui.groups = ui.groups.map((group) => ({
				...group,
				members: group.members.filter((person) => person !== id)
			}));
			if (session.groups) session.groups = ui.groups;
		} else {
			const term = ui.scheduleTerm;
			if (term) {
				ui.scheduleStatus[term] ??= {};
				ui.scheduleErrors[term] ??= {};
				ui.scheduleStatus[term][id] = 'error';
				ui.scheduleErrors[term][id] = 'Sharing changed. Reload friends to update availability.';
			}
			await loadFriends();
		}
		return true;
	}

	async function loadBusyRange(from: string, until: string) {
		if (!session.active || !validBusyRange(from, until)) return;
		const range = busyRangeKey(from, until);
		await Promise.all(
			ui.selected.map((id) => {
				const person = ui.friends.find((friend) => friend.id === id);
				if (
					id !== 'you' &&
					(!person ||
						(person.expires_at && Date.parse(person.expires_at) <= Math.max(ui.now, Date.now())))
				)
					return;
				const version = session.busyVersions[id] ?? 0;
				const key = `${id}:${range}:${version}`;
				const pending = busyInFlight.get(key);
				if (pending) return pending;
				if (ui.busyStatus[range]?.[id] === 'loaded' || ui.busyStatus[range]?.[id] === 'error')
					return;
				const fresh = () =>
					session.active &&
					(session.busyVersions[id] ?? 0) === version &&
					ui.selected.includes(id) &&
					(id === 'you' ||
						ui.friends.some(
							(friend) =>
								friend.id === id &&
								friend.visibility?.theirs === person?.visibility?.theirs &&
								(!friend.expires_at || Date.parse(friend.expires_at) > Math.max(ui.now, Date.now()))
						));
				ui.busyStatus[range] ??= {};
				ui.busyErrors[range] ??= {};
				ui.busyStatus[range][id] = 'loading';
				const request = withScheduleSlot(async () => {
					if (!fresh()) return;
					try {
						const data = await session.loadBusyBlocks(id, from, until);
						if (!fresh()) return;
						ui.busyBlocks[range] ??= {};
						ui.busyBlocks[range][id] = data;
						ui.busyStatus[range][id] = 'loaded';
						delete ui.busyErrors[range][id];
					} catch (error) {
						console.error(`Failed to load busy blocks for ${id}`, error);
						if (!fresh() || (await handleAccessError(id, error))) return;
						ui.busyStatus[range][id] = 'error';
						ui.busyErrors[range][id] = errorMessage(
							'Could not load availability',
							error,
							'Reload schedules to try again.'
						);
					}
				});
				busyInFlight.set(key, request);
				void request.finally(() => {
					if (busyInFlight.get(key) === request) busyInFlight.delete(key);
				});
				return request;
			})
		);
	}

	async function loadFriends(useCachedFriends = false) {
		if (!session.active) return;
		const version = ++friendsVersion;
		const fresh = () => session.active && version === friendsVersion;
		const cachedFriends = useCachedFriends ? session.friends : undefined;
		ui.friendsLoading = !cachedFriends;
		ui.friendsError = '';
		try {
			const friends = cachedFriends ?? (await API.getFriends()).friends;
			if (!fresh()) return;
			const ids = new Set(['you', ...friends.map((friend) => friend.id)]);
			const removed = ui.selected.some((id) => !ids.has(id));
			for (const friend of ui.friends) {
				const updated = friends.find((person) => person.id === friend.id);
				if (
					!updated ||
					updated.visibility?.theirs !== friend.visibility?.theirs ||
					updated.expires_at !== friend.expires_at
				)
					discardFriend(friend.id);
			}
			ui.friends = friends;
			session.friends = friends;
			ui.selected = ui.selected.filter((id) => ids.has(id));
			ui.groups = ui.groups.map((group) => ({
				...group,
				members: group.members.filter((id) => ids.has(id))
			}));
			if (session.groups) session.groups = ui.groups;
			if (removed)
				report('A selected friend is no longer available and was removed from planning.');
		} catch (error) {
			console.error('Failed to load friends data', error);
			if (!fresh()) return;
			ui.friendsError = errorMessage(
				'Could not load friends',
				error,
				'Reload friends to try again.'
			);
			report(ui.friendsError);
		} finally {
			if (fresh()) ui.friendsLoading = false;
		}
	}

	async function loadRequests() {
		if (!session.active) return;
		const version = ++requestsVersion;
		const fresh = () => session.active && version === requestsVersion;
		ui.requestsLoading = true;
		ui.requestsError = '';
		try {
			const requests = await API.getFriendRequests();
			if (!fresh()) return;
			ui.incomingRequests = requests.incoming;
			ui.outgoingRequests = requests.outgoing;
		} catch (error) {
			console.error('Failed to load friends data', error);
			if (!fresh()) return;
			ui.requestsError = errorMessage(
				'Could not load requests',
				error,
				'Reload requests to try again.'
			);
			report(ui.requestsError);
		} finally {
			if (fresh()) ui.requestsLoading = false;
		}
	}

	async function loadFriendsAndRequests(useCachedFriends = false) {
		await Promise.all([loadFriends(useCachedFriends), loadRequests()]);
	}

	async function loadGroups(useCachedGroups = false) {
		if (!session.active || ui.groupLoadingId) return;
		const version = ++groupsVersion;
		const fresh = () => session.active && version === groupsVersion;
		const cached = useCachedGroups ? session.groups : undefined;
		ui.groupsLoading = !cached;
		ui.groupsError = '';
		try {
			const groups = cached ?? (await API.getFriendGroups());
			if (!fresh()) return;
			const ids = session.friends && new Set(session.friends.map((friend) => friend.id));
			ui.groups = groups.map((group) => ({
				...group,
				members: ids ? group.members.filter((id) => ids.has(id)) : group.members
			}));
			session.groups = ui.groups;
		} catch (error) {
			console.error('Failed to load friend groups', error);
			if (!fresh()) return;
			ui.groupsError = errorMessage('Could not load groups', error, 'Reload groups to try again.');
		} finally {
			if (fresh()) ui.groupsLoading = false;
		}
	}

	async function changeGroup(id: string, action: () => Promise<void>): Promise<boolean> {
		if (!session.active || ui.groupLoadingId || ui.groupsLoading) return false;
		++groupsVersion;
		ui.groupLoadingId = id;
		ui.groupsError = '';
		try {
			await action();
			return session.active;
		} catch (error) {
			console.error('Failed to save friend groups', error);
			if (session.active)
				ui.groupsError = errorMessage(
					'Could not save group',
					error,
					'Your edits are kept. Try again.'
				);
			return false;
		} finally {
			if (session.active) ui.groupLoadingId = '';
		}
	}

	function loadSchedule(term: string, id: string): Promise<void> {
		if (!session.active || ui.scheduleTerm !== term || !ui.selected.includes(id))
			return Promise.resolve();
		if (id === 'you' && session.termProcessing.pending.has(term))
			return session.termProcessing.wait(term).then(() => loadSchedule(term, id));
		if (
			id !== 'you' &&
			ui.friends.find((friend) => friend.id === id)?.visibility?.theirs === 'availability_only'
		)
			return Promise.resolve();
		const key = `${term}:${id}`;
		const pending = inFlight.get(key);
		if (pending) return pending;
		const generation = generations[key] ?? 0;
		const ownVersion = session.ownScheduleVersions[term] ?? 0;
		const fresh = () =>
			session.active &&
			ui.scheduleTerm === term &&
			ui.selected.includes(id) &&
			(generations[key] ?? 0) === generation &&
			(id !== 'you' || (session.ownScheduleVersions[term] ?? 0) === ownVersion) &&
			(id === 'you' ||
				ui.friends.some(
					(person) =>
						person.id === id &&
						person.visibility?.theirs !== 'availability_only' &&
						(!person.expires_at || Date.parse(person.expires_at) > Math.max(ui.now, Date.now()))
				));
		ui.scheduleStatus[term] ??= {};
		ui.scheduleErrors[term] ??= {};
		const cached =
			id === 'you'
				? $storedProcessedData.find((item) => String(item.termId) === term)?.responseData.classes
				: session.schedules[term]?.[id];
		if (cached) {
			try {
				validateCourses(cached);
				if (id !== 'you') {
					ui.friendSchedules[term] ??= {};
					ui.friendSchedules[term][id] = cached;
				}
				ui.scheduleStatus[term][id] = 'loaded';
				delete ui.scheduleErrors[term][id];
				return Promise.resolve();
			} catch (error) {
				console.error(`Failed to load schedule for ${id}`, error);
			}
		}
		ui.scheduleStatus[term][id] = 'loading';
		delete ui.scheduleErrors[term][id];
		const request = withScheduleSlot(async () => {
			if (!fresh()) return;
			try {
				const response =
					id === 'you'
						? await session.loadProcessedEvents(term)
						: await API.getFriendProcessedEvents(id, term);
				if (!fresh()) return;
				let courses: Course[];
				if (id === 'you') {
					courses = 'classes' in response ? response.classes : [];
					validateCourses('classes' in response ? response.classes : undefined);
				} else courses = mapFriendCourses(response, id);
				if (!fresh()) return;
				if (id === 'you') {
					storedProcessedData.update((data) => [
						...data.filter((item) => String(item.termId) !== term),
						{ termId: term, responseData: { classes: courses, ics_url: '' } }
					]);
				} else {
					ui.friendSchedules[term] ??= {};
					session.schedules[term] ??= {};
					ui.friendSchedules[term][id] = courses;
					session.schedules[term][id] = courses;
				}
				ui.scheduleStatus[term][id] = 'loaded';
				delete ui.scheduleErrors[term][id];
			} catch (error) {
				// Failed and unprocessed schedules are not cached. The friend
				// can finish setup later, so the next visit asks again.
				if (!fresh()) return;
				let unprocessed = false;
				if (await handleAccessError(id, error)) return;
				try {
					const status =
						id === 'you' ? await API.userIsProcessed(term) : await API.friendIsProcessed(id, term);
					if (!fresh()) return;
					unprocessed = !status.processed;
				} catch (statusError) {
					console.error(`Failed to check processed status for ${id}`, statusError);
					if (fresh() && (await handleAccessError(id, statusError))) return;
				}
				if (!fresh()) return;
				if (id === 'you') console.error('Failed to load your schedule', error);
				else console.error(`Failed to load schedule for ${id}`, error);
				const name =
					id === 'you' ? 'Your' : `${ui.friends.find((person) => person.id === id)?.name}'s`;
				ui.scheduleStatus[term][id] = unprocessed ? 'unprocessed' : 'error';
				ui.scheduleErrors[term][id] = unprocessed
					? `${name} schedule is not set up for this term. Finish calendar setup, then reload schedules.`
					: errorMessage(
							`Could not load ${name.toLowerCase()} schedule`,
							error,
							'Reload schedules to try again.'
						);
				report(ui.scheduleErrors[term][id]);
			}
		});
		inFlight.set(key, request);
		void request.finally(() => {
			if (inFlight.get(key) === request) inFlight.delete(key);
		});
		return request;
	}

	async function loadFriendSchedules(term: string) {
		// Only friends without a cached schedule for this term need a request.
		await Promise.all(
			ui.friends
				.filter((friend) => ui.selected.includes(friend.id))
				.map((friend) => loadSchedule(term, friend.id))
		);
	}

	async function loadOwnSchedule(term: string) {
		await loadSchedule(term, 'you');
	}

	async function performAction<T>(
		id: string,
		operation: string,
		action: () => Promise<T>,
		after?: (result: T) => void | Promise<void>
	) {
		if (!session.active || ui.actionLoadingId) return;
		ui.actionLoadingId = id;
		ui.friendError = '';
		ui.friendNotice = '';
		try {
			const result = await action();
			if (!session.active) return;
			await after?.(result);
		} catch (error) {
			console.error(operation, error);
			if (!session.active) return;
			ui.friendError = errorMessage(operation, error, 'Try the action again.');
			report(ui.friendError);
		} finally {
			if (session.active) ui.actionLoadingId = '';
		}
	}

	async function sendFriendRequest() {
		const value = ui.sendFriendIdInput.trim();
		const message = requestInputMessage(value);
		if (message) {
			ui.friendError = message;
			report(message);
			return;
		}
		await performAction(
			'send-request',
			'Failed to send friend request',
			() =>
				API.createFriendRequest({
					visibility: ui.sendFriendVisibility,
					...(value.includes('@') ? { friend_email: value } : { friend_id: value }),
					...(ui.sendFriendExpiry
						? {
								expires_at: new Date(
									Date.parse(calendarDateTime(shiftDate(ui.sendFriendExpiry, 1), '00:00')) - 1
								).toISOString()
							}
						: {})
				}).catch((error) => {
					throw new Error(friendRequestErrorMessage(error));
				}),
			async () => {
				ui.sendFriendIdInput = '';
				ui.sendFriendExpiry = '';
				await loadRequests();
			}
		);
	}

	async function acceptRequest(requestId: string, visibility?: SharingLevel) {
		await performAction(
			`accept-${requestId}`,
			'Failed to accept request',
			() => API.acceptFriendRequest(requestId, visibility),
			() => loadFriendsAndRequests()
		);
	}

	async function declineRequest(requestId: string) {
		await performAction(
			`decline-${requestId}`,
			'Failed to decline request',
			() => API.declineFriendRequest(requestId),
			() => loadRequests()
		);
	}

	async function cancelRequest(requestId: string) {
		await performAction(
			`cancel-${requestId}`,
			'Failed to cancel request',
			() => API.cancelFriendRequest(requestId),
			() => loadRequests()
		);
	}

	async function unfriend(friendId: string) {
		await performAction(
			`unfriend-${friendId}`,
			'Failed to remove friend',
			() => API.removeFriend(friendId),
			() => {
				++friendsVersion;
				ui.friendsLoading = false;
				discardFriend(friendId);
				ui.invalidateMeetings(session);
				ui.friends = ui.friends.filter((person) => person.id !== friendId);
				session.friends = ui.friends;
				if (ui.selected.includes(friendId))
					report('Removed friend from the active planning participants.');
				ui.selected = ui.selected.filter((id) => id !== friendId);
				ui.groups = ui.groups.map((group) => ({
					...group,
					members: group.members.filter((id) => id !== friendId)
				}));
				if (session.groups) session.groups = ui.groups;
			}
		);
	}

	async function loadTerms(force = false) {
		const version = ++termsVersion;
		const fresh = () => session.active && version === termsVersion;
		try {
			// The calendar page may already have loaded the terms in this session.
			const terms = await session.loadTerms(force);
			if (!fresh()) return;
			const current = terms.current_term ?? terms.next_term;
			if (!current) throw new Error('No current planning term was returned.');
			const bounds: Record<string, { start?: string; end?: string }> = {};
			for (const term of [terms.current_term, terms.next_term]) {
				if (!term) continue;
				validateTermBounds({ start: term.start_date, end: term.end_date });
				bounds[String(term.id)] = {
					start: term.start_date?.slice(0, 10),
					end: term.end_date?.slice(0, 10)
				};
			}
			ui.termBounds = bounds;
			ui.currentTerm = String(current.id);
			ui.term ??= ui.currentTerm;
			ui.termError = '';
		} catch (error) {
			// Without the terms the page cannot pick a term, but the friend
			// list and the requests below still load.
			console.error('Failed to load terms', error);
			if (!fresh()) return;
			ui.termError = errorMessage(
				'Could not load planning term',
				error,
				'Reload schedules to try again.'
			);
			report(ui.termError);
		}
	}

	onMount(() => {
		void loadTerms();
		void loadFriendsAndRequests(true);
		void loadGroups(true);
	});

	ui.groupActions = {
		reload: () => loadGroups(),
		save: (name, members, id) =>
			changeGroup(id ?? 'new-group', async () => {
				const group = await API.saveFriendGroup(name, members, id);
				if (!session.active) return;
				ui.groups = id
					? ui.groups.map((existing) => (existing.id === id ? group : existing))
					: [...ui.groups, group];
				session.groups = ui.groups;
			}),
		remove: (id) =>
			changeGroup(id, async () => {
				await API.deleteFriendGroup(id);
				if (!session.active) return;
				ui.groups = ui.groups.filter((group) => group.id !== id);
				session.groups = ui.groups;
			})
	};

	ui.friendActions = {
		refresh: async () => {
			await Promise.all([loadFriendsAndRequests(), loadTerms(true)]);
			if (!session.active) return;
			await loadGroups();
			if (!session.active) return;
			for (const friend of ui.friends) discardFriend(friend.id);
			for (const item of $storedProcessedData) session.invalidateOwnSchedule(String(item.termId));
			storedProcessedData.set([]);
			await ui.friendActions?.retrySchedules();
		},
		setSharing: (id, level) =>
			performAction(
				`sharing-${id}`,
				'Failed to update sharing',
				() => API.setFriendVisibility(id, level),
				(result) => {
					const previous = ui.friends.find((person) => person.id === id);
					if (previous?.visibility?.theirs !== result.theirs) discardFriend(id);
					++friendsVersion;
					ui.friendsLoading = false;
					ui.friends = ui.friends.map((person) =>
						person.id === id
							? { ...person, visibility: { mine: result.mine, theirs: result.theirs } }
							: person
					);
					session.friends = ui.friends;
					ui.friendNotice = 'Your sharing preference applies now.';
				}
			),
		reload: () => loadFriendsAndRequests(),
		retrySchedules: async () => {
			if (ui.termError || !ui.currentTerm) await loadTerms(true);
			const term = selected;
			if (!term || !session.active || ui.termError) return;
			for (const id of ui.selected) {
				discardBusy(id);
				const key = `${term}:${id}`;
				generations[key] = (generations[key] ?? 0) + 1;
				inFlight.delete(key);
				delete session.schedules[term]?.[id];
				delete ui.friendSchedules[term]?.[id];
				delete ui.scheduleStatus[term]?.[id];
				delete ui.scheduleErrors[term]?.[id];
			}
			if (ui.selected.includes('you')) {
				session.invalidateOwnSchedule(term);
				storedProcessedData.update((data) => data.filter((item) => String(item.termId) !== term));
			}
			await Promise.all([
				loadBusyRange(ui.preferences.from, ui.preferences.until),
				loadFriendSchedules(term),
				...(ui.selected.includes('you') ? [loadOwnSchedule(term)] : [])
			]);
		},
		send: sendFriendRequest,
		accept: acceptRequest,
		decline: declineRequest,
		cancel: cancelRequest,
		remove: unfriend,
		setExpiry: (id, value) =>
			performAction(
				`expiry-${id}`,
				'Failed to update expiry',
				() => API.setFriendExpiry(id, value),
				(result) => {
					++friendsVersion;
					++requestsVersion;
					ui.friendsLoading = false;
					ui.requestsLoading = false;
					ui.friends = ui.friends.map((friend) =>
						friend.id === id ? { ...friend, expires_at: result.expires_at } : friend
					);
					session.friends = ui.friends;
					ui.incomingRequests = ui.incomingRequests.map((request) =>
						request.from.id === id ? { ...request, expires_at: result.expires_at } : request
					);
					ui.outgoingRequests = ui.outgoingRequests.map((request) =>
						request.to.id === id ? { ...request, expires_at: result.expires_at } : request
					);
					ui.friendNotice =
						result.expiry_change === 'proposed'
							? 'Proposal sent by email. Your friend must approve it in the web dashboard before the expiry changes.'
							: result.expiry_change === 'shortened'
								? 'The earlier expiry applies now.'
								: 'The expiry is unchanged.';
				}
			)
	};
	ui.busyActions = { load: loadBusyRange, invalidate: discardBusy };
	session.ownScheduleProcessed = (term) => {
		discardBusy('you');
		ui.scheduleStatus[term] ??= {};
		ui.scheduleStatus[term].you = 'loaded';
		delete ui.scheduleErrors[term]?.you;
	};
	$effect(() => {
		const from = ui.preferences.from;
		const until = ui.preferences.until;
		const ids = ui.selected.join(',');
		const friends = friendIds;
		const version = ui.busyVersion;
		if (!loadSchedules || !ui.planning || !ids || !friends) return;
		void version;
		untrack(() => void loadBusyRange(from, until));
	});
	$effect(() => {
		const term = selected;
		const ids = ui.selected.join(',');
		const friends = friendIds;
		if (!loadSchedules || !term || !ids || ui.termError) return;
		void friends;
		untrack(() => {
			void loadFriendSchedules(term);
			if (ui.selected.includes('you')) void loadOwnSchedule(term);
		});
	});
	$effect(() => {
		const expired = ui.friends.filter(
			(friend) => friend.expires_at && Date.parse(friend.expires_at) <= ui.now
		);
		if (!expired.length) return;
		untrack(() => {
			for (const friend of expired) discardFriend(friend.id);
			ui.invalidateMeetings(session);
			++friendsVersion;
			ui.friendsLoading = false;
			const ids = new Set(expired.map((friend) => friend.id));
			ui.friends = ui.friends.filter((friend) => !ids.has(friend.id));
			session.friends = ui.friends;
			ui.selected = ui.selected.filter((id) => !ids.has(id));
			ui.groups = ui.groups.map((group) => ({
				...group,
				members: group.members.filter((id) => !ids.has(id))
			}));
			if (session.groups) session.groups = ui.groups;
		});
	});
	$effect(() => {
		const now = ui.now;
		const incoming = ui.incomingRequests.filter(
			(request) => !(request.expires_at && Date.parse(request.expires_at) <= now)
		);
		const outgoing = ui.outgoingRequests.filter(
			(request) => !(request.expires_at && Date.parse(request.expires_at) <= now)
		);
		untrack(() => {
			if (incoming.length !== ui.incomingRequests.length) ui.incomingRequests = incoming;
			if (outgoing.length !== ui.outgoingRequests.length) ui.outgoingRequests = outgoing;
		});
	});
	$effect(() => {
		if (ui.manageOpen)
			untrack(() => {
				void loadFriendsAndRequests();
			});
	});
</script>
