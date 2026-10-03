import { getContext, setContext } from 'svelte';
import type { Course, FriendIdentity, FriendRequestIncoming, FriendRequestOutgoing } from './types';
import { schoolDays, weekDates } from './calendarDates';
import type {
	MeetingPreferences,
	MeetingDraft,
	Participant,
	FriendGroup,
	PreviewSlot
} from './components/friends/types';

import { browser } from '$app/environment';
import { timeMinutes } from './components/friends/availability';

const PLANNING_KEY = 'friendsPlanning';

export class PanelUi {
	term = $state<string>();
	datedTerm = $state<string>();
	termOptions = $state<Array<{ id: string; name: string }>>([]);
	week = $state(weekDates()[0]);
	selected = $state(['you']);
	calendarActions = $state.raw<{
		refresh: () => void;
		copyLink?: () => void;
		refreshing: boolean;
		loading: boolean;
	}>();
	currentTerm = $state<string>();
	now = $state(Date.now());

	termBounds = $state<Record<string, { start?: string; end?: string }>>({});
	friends = $state<FriendIdentity[]>([]);
	hasSelectedFriends = $derived(this.friends.some((friend) => this.selected.includes(friend.id)));
	people = $derived<Participant[]>([
		{ id: 'you', name: 'You', sharing: 'Full schedule' },
		...this.friends.map((person) => ({ ...person, sharing: 'Full schedule' as const }))
	]);
	groups = $state<FriendGroup[]>([]);
	friendSchedules = $state<Record<string, Record<string, Course[]>>>({});
	scheduleStatus = $state<
		Record<string, Record<string, 'loading' | 'loaded' | 'unprocessed' | 'error'>>
	>({});
	incomingRequests = $state<FriendRequestIncoming[]>([]);
	outgoingRequests = $state<FriendRequestOutgoing[]>([]);
	friendError = $state('');
	friendsError = $state('');
	requestsError = $state('');
	termError = $state('');
	planning = $state(false);
	scheduleErrors = $state<Record<string, Record<string, string>>>({});
	friendsLoading = $state(false);
	requestsLoading = $state(false);
	actionLoadingId = $state('');
	sendFriendIdInput = $state('');
	friendActions = $state.raw<{
		reload: () => Promise<void>;
		retrySchedules: () => Promise<void>;
		send: () => Promise<void>;
		accept: (id: string) => Promise<void>;
		decline: (id: string) => Promise<void>;
		cancel: (id: string) => Promise<void>;
		remove: (id: string) => Promise<void>;
	}>();
	comparison = $state(false);
	comparisonDisplay = $state<'group' | 'detailed'>();
	scheduleTerm = $derived(
		this.planning ? this.currentTerm : this.comparison ? this.term : this.currentTerm
	);
	manageOpen = $state(false);
	highlightedSlot = $state<PreviewSlot>();
	restoredPreview = $state<PreviewSlot>();
	meetingDraft = $state<MeetingDraft>();
	meetingEditorOpen = $state(false);
	meetingDetails = $state(false);
	starts = $state<Record<string, number>>({});
	preferences = $state<MeetingPreferences>({
		from: schoolDays()[0],
		until: schoolDays()[4],
		duration: '30',
		dailyStart: '09:00',
		dailyEnd: '17:00',
		buffer: '10',
		betweenClasses: false
	});

	constructor() {
		if (!browser) return;
		try {
			const saved = JSON.parse(localStorage.getItem(PLANNING_KEY) ?? '{}') as {
				selected?: unknown;
				duration?: unknown;
				dailyStart?: unknown;
				dailyEnd?: unknown;
			};
			if (!saved || typeof saved !== 'object') return;
			if (Array.isArray(saved.selected))
				this.selected = saved.selected
					.filter((id): id is string => typeof id === 'string')
					.filter((id, index, ids) => ids.indexOf(id) === index);
			if (
				typeof saved.duration === 'string' &&
				Number.isInteger(Number(saved.duration)) &&
				Number(saved.duration) > 0
			)
				this.preferences.duration = saved.duration;
			for (const key of ['dailyStart', 'dailyEnd'] as const) {
				const value = saved[key];
				if (typeof value === 'string' && timeMinutes(value) !== undefined)
					this.preferences[key] = value;
			}
		} catch (error) {
			console.error('Failed to load saved friend planning preferences', error);
		}
	}

	savePlanning(): void {
		if (!browser) return;
		try {
			localStorage.setItem(
				PLANNING_KEY,
				JSON.stringify({
					selected: this.selected,
					duration: this.preferences.duration,
					dailyStart: this.preferences.dailyStart,
					dailyEnd: this.preferences.dailyEnd
				})
			);
		} catch (error) {
			console.error('Failed to save friend planning preferences', error);
		}
	}
}

const KEY = Symbol('panelUi');

export function setPanelUi(current: () => PanelUi): void {
	setContext(KEY, current);
}

export function getPanelUi(): PanelUi {
	return getContext<() => PanelUi>(KEY)();
}
