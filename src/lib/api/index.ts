import type {
	CatalogTerm,
	ConnectedAccount,
	CurrentTerm,
	ProcessingTerm,
	BatchProcessingResponse,
	FeatureFlagsResponse,
	FriendListResponse,
	FriendProcessedEventsResponse,
	FriendRequestAcceptResponse,
	FriendRequestCreateResponse,
	FriendRequestsResponse,
	GetPreferencesResponse,
	isProcessed,
	OkResponse,
	ProcessedEvents,
	TermResponse,
	UserSettings,
	FriendRequestInput,
	FriendExpiryResponse,
	MeetingLinkInput,
	MeetingLinkCreateResponse,
	MeetingLinkResponse,
	MeetingLinksResponse,
	SharingLevel,
	FriendVisibilityResponse
} from '../types';
import {
	friendList,
	friendRequests,
	processedStatus,
	requestCreated,
	requestAccepted,
	mutationResult,
	friendExpiry,
	meetingLinks,
	meetingLink,
	meetingLinkCreated,
	friendVisibility,
	friendGroups,
	friendGroup
} from '../friends/parse';
import {
	validatedTerms,
	validateCourses,
	busyBlocks,
	type BusyBlocksResponse
} from '../friends/schedule';
import type { PasskeySummary } from '../auth/passkeys';
import type { FriendGroup } from '../friends/types';
import {
	savedMeetings,
	savedMeetingResponse,
	type SavedMeetingsResponse,
	type SavedMeetingChanges,
	type SavedMeeting,
	type SavedMeetingInput
} from '../friends/savedMeetings';
import { getBaseUrl, getJwtToken, readJson, request, requestJson } from './client';

export { ApiError } from './client';

const PREFERENCE_VERSION = /^[a-f0-9]{64}$/;

export class API {
	public static get baseUrl(): Promise<string> {
		return getBaseUrl();
	}

	public static async getJwtToken(): Promise<string | undefined> {
		return getJwtToken();
	}

	// Reads one flag from the full list. An unknown flag is off.
	public static async checkFeatureFlag(flagName: string): Promise<boolean> {
		const { feature_flags } = await this.getAllFeatureFlags();
		return feature_flags?.[flagName] ?? false;
	}

	public static async getAllFeatureFlags(): Promise<FeatureFlagsResponse> {
		const response = await request('/user/feature_flags');

		if (!response.ok) {
			console.error('Feature flags API error:', response.status, response.statusText);
			throw new Error(`Failed to fetch feature flags: ${response.status}`);
		}

		return response.json();
	}

	// The current and the next term from the public catalog API. The catalog
	// answers 404 when a term does not exist yet, which becomes null here.
	public static async getTerms(): Promise<TermResponse> {
		const baseUrl = await getBaseUrl();
		const [current_term, next_term] = await Promise.all([
			this.getCatalogTerm(`${baseUrl}/v1/catalog/terms/current`),
			this.getCatalogTerm(`${baseUrl}/v1/catalog/terms/next`)
		]);
		return validatedTerms({ current_term, next_term });
	}

	private static async getCatalogTerm(url: string): Promise<CurrentTerm | null> {
		const response = await fetch(url, { method: 'GET' });
		if (response.status === 404) {
			await response.text();
			return null;
		}

		const { data } = await readJson<{ data: CatalogTerm }>(response, 'Failed to fetch terms');
		return { id: data.uid, name: data.name, start_date: data.start_date, end_date: data.end_date };
	}

	// GET /api/user returns the public id, the email, and the ICS URL together.
	public static async getUser(): Promise<{ pub_id: string; email: string; ics_url: string }> {
		return requestJson('/user', 'Failed to fetch the user');
	}

	public static async getUserEmail(): Promise<{ email: string }> {
		const { email } = await this.getUser();
		return { email };
	}

	public static async getIcsUrl(): Promise<{ ics_url: string }> {
		const { ics_url } = await this.getUser();
		return { ics_url };
	}

	public static async userSettings(settings?: Partial<UserSettings>): Promise<UserSettings> {
		if (settings === undefined) {
			return requestJson('/user/extension_config', 'Failed to fetch the user settings');
		}
		return requestJson('/user/extension_config', 'Failed to save the user settings', {
			method: 'PUT',
			body: settings
		});
	}

	public static async userIsProcessed(termUid: string): Promise<isProcessed> {
		return processedStatus(
			await requestJson<isProcessed>(
				`/user/processed_events/status?term_uid=${encodeURIComponent(termUid)}`,
				'Failed to check your schedule status'
			)
		);
	}

	public static async getProcessedEvents(termUid: string): Promise<ProcessedEvents> {
		const data = await requestJson<ProcessedEvents>(
			`/user/processed_events?term_uid=${encodeURIComponent(termUid)}`,
			'Failed to fetch your schedule'
		);
		validateCourses(data?.classes);
		return data;
	}

	public static async getFriends(): Promise<FriendListResponse> {
		return friendList(await requestJson<FriendListResponse>('/friends', 'Failed to fetch friends'));
	}

	public static async getFriendRequests(): Promise<FriendRequestsResponse> {
		return friendRequests(
			await requestJson<FriendRequestsResponse>(
				'/friends/requests',
				'Failed to fetch friend requests'
			)
		);
	}

	public static async createFriendRequest(
		payload: FriendRequestInput
	): Promise<FriendRequestCreateResponse> {
		return requestCreated(
			await requestJson<FriendRequestCreateResponse>(
				'/friends/requests',
				'Failed to send the friend request',
				{ method: 'POST', body: payload }
			)
		);
	}

	public static async acceptFriendRequest(
		requestId: string,
		visibility?: SharingLevel
	): Promise<FriendRequestAcceptResponse> {
		return requestAccepted(
			await requestJson<FriendRequestAcceptResponse>(
				`/friends/requests/${requestId}/accept`,
				'Failed to accept the friend request',
				{ method: 'POST', body: visibility === undefined ? undefined : { visibility } }
			)
		);
	}

	public static async declineFriendRequest(requestId: string): Promise<OkResponse> {
		return mutationResult(
			await requestJson(
				`/friends/requests/${requestId}/decline`,
				'Failed to decline the friend request',
				{ method: 'POST' }
			)
		);
	}

	public static async cancelFriendRequest(requestId: string): Promise<OkResponse> {
		return mutationResult(
			await requestJson(`/friends/requests/${requestId}`, 'Failed to cancel the friend request', {
				method: 'DELETE'
			})
		);
	}

	public static async removeFriend(friendId: string): Promise<OkResponse> {
		return mutationResult(
			await requestJson(`/friends/${friendId}`, 'Failed to remove the friend', {
				method: 'DELETE'
			})
		);
	}

	public static async friendIsProcessed(friendId: string, termUid: string): Promise<isProcessed> {
		return processedStatus(
			await requestJson<isProcessed>(
				`/friends/${friendId}/processed_events/status?term_uid=${encodeURIComponent(termUid)}`,
				'Failed to check the friend schedule status'
			)
		);
	}

	public static async getFriendProcessedEvents(
		friendId: string,
		termUid: string
	): Promise<FriendProcessedEventsResponse> {
		return requestJson(
			`/friends/${friendId}/processed_events?term_uid=${encodeURIComponent(termUid)}`,
			`Failed to fetch the schedule of friend ${friendId}`
		);
	}

	public static async setFriendExpiry(
		friendId: string,
		expiresAt: string | null
	): Promise<FriendExpiryResponse> {
		return friendExpiry(
			await requestJson(
				`/friends/${encodeURIComponent(friendId)}/expiry`,
				'Failed to update friendship expiry',
				{ method: 'PATCH', body: { expires_at: expiresAt } }
			)
		);
	}

	public static async getMeetingLinks(): Promise<MeetingLinksResponse> {
		return meetingLinks(await requestJson('/meeting_links', 'Failed to fetch meeting links'));
	}

	public static async setFriendVisibility(
		friendId: string,
		visibility: SharingLevel
	): Promise<FriendVisibilityResponse> {
		const result = friendVisibility(
			await requestJson(
				`/friends/${encodeURIComponent(friendId)}/visibility`,
				'Failed to update sharing',
				{ method: 'PATCH', body: { visibility } }
			)
		);
		if (result.friend_id !== friendId)
			throw new Error('The sharing change was not confirmed. Reload friends to try again.');
		return result;
	}

	public static async getBusyBlocks(
		id: string,
		from: string,
		until: string
	): Promise<BusyBlocksResponse> {
		const range = new URLSearchParams({ start_date: from, end_date: until });
		const path =
			id === 'you' ? '/user/busy_blocks' : `/friends/${encodeURIComponent(id)}/busy_blocks`;
		return busyBlocks(
			await requestJson(`${path}?${range}`, 'Failed to fetch availability'),
			from,
			until
		);
	}

	public static async getFriendGroups(): Promise<FriendGroup[]> {
		return friendGroups(await requestJson('/friends/groups', 'Failed to fetch groups'));
	}

	public static async saveFriendGroup(
		name: string | undefined,
		memberIds: string[] | undefined,
		groupId?: string,
		expiresAt?: string | null
	): Promise<FriendGroup> {
		return friendGroup(
			await requestJson(
				groupId ? `/friends/groups/${encodeURIComponent(groupId)}` : '/friends/groups',
				'Failed to save group',
				{
					method: groupId ? 'PATCH' : 'POST',
					body: { name, member_ids: memberIds, expires_at: expiresAt }
				}
			)
		);
	}

	public static async deleteFriendGroup(id: string): Promise<OkResponse> {
		return mutationResult(
			await requestJson(`/friends/groups/${encodeURIComponent(id)}`, 'Failed to delete group', {
				method: 'DELETE'
			})
		);
	}

	public static async getSavedMeetings(start: string, end: string): Promise<SavedMeetingsResponse> {
		const range = new URLSearchParams({ start, end });
		return savedMeetings(
			await requestJson(`/friends/meetings?${range}`, 'Failed to fetch saved meetings')
		);
	}

	public static async updateSavedMeeting(
		id: string,
		changes: SavedMeetingChanges
	): Promise<{ meeting: SavedMeeting }> {
		return savedMeetingResponse(
			await requestJson(`/friends/meetings/${encodeURIComponent(id)}`, 'Failed to update meeting', {
				method: 'PATCH',
				body: changes
			})
		);
	}

	public static async createSavedMeeting(
		payload: SavedMeetingInput,
		idempotencyKey: string
	): Promise<{ meeting: SavedMeeting }> {
		return savedMeetingResponse(
			await requestJson('/friends/meetings', 'Failed to create meeting', {
				method: 'POST',
				headers: { 'Idempotency-Key': idempotencyKey },
				body: payload
			})
		);
	}

	public static async leaveSavedMeeting(id: string): Promise<void> {
		const response = await request(`/friends/meetings/${encodeURIComponent(id)}/attendance`, {
			method: 'DELETE'
		});
		if (!response.ok) await readJson(response, 'Failed to leave meeting');
	}

	public static async deleteSavedMeeting(id: string): Promise<void> {
		const response = await request(`/friends/meetings/${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		if (!response.ok) await readJson(response, 'Failed to delete meeting');
	}

	public static async createMeetingLink(
		payload: MeetingLinkInput
	): Promise<MeetingLinkCreateResponse> {
		return meetingLinkCreated(
			await requestJson('/meeting_links', 'Failed to create meeting link', {
				method: 'POST',
				body: payload
			})
		);
	}

	public static async revokeMeetingLink(linkId: string): Promise<MeetingLinkResponse> {
		return meetingLink(
			await requestJson(
				`/meeting_links/${encodeURIComponent(linkId)}`,
				'Failed to revoke meeting link',
				{ method: 'DELETE' }
			)
		);
	}

	// Course processing endpoints
	public static async processCoursesBatch(
		terms: ProcessingTerm[]
	): Promise<BatchProcessingResponse> {
		const data = await requestJson<BatchProcessingResponse>(
			'/process_courses/batch',
			'Failed to process terms',
			{ method: 'POST', body: { terms } }
		);
		if (
			!Array.isArray(data?.terms) ||
			data.terms.length !== terms.length ||
			data.terms.some(
				(result, index) =>
					result.term !== terms[index].term ||
					!['processed', 'pending', 'failed'].includes(result.status)
			)
		) {
			throw new Error('Invalid batch processing response');
		}
		return data;
	}

	public static async processCourses(
		courses: any[]
	): Promise<{ user_pub: string; ics_url: string }> {
		const response = await request('/process_courses', { method: 'POST', body: courses });
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Process courses failed: ${response.status} ${response.statusText} - ${errorText}`
			);
		}
		return response.json();
	}

	public static async reprocessCourses(courses: any[]): Promise<{
		ics_url: string;
		removed_enrollments: number;
		removed_courses: Array<{ crn: number; title: string; course_number: number }>;
		processed_courses: any[];
	}> {
		const response = await request('/courses/reprocess', { method: 'POST', body: { courses } });
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Reprocess courses failed: ${response.status} ${response.statusText} - ${errorText}`
			);
		}
		return response.json();
	}

	// Event preferences endpoints
	public static async getPreferenceVersion(): Promise<string | undefined> {
		const response = await request('/user/preferences/version', { cache: 'no-store' });
		if (response.status === 404 || response.status === 405) return undefined;
		const data = await readJson<{ version: unknown }>(response, 'Failed to check preferences');
		if (typeof data.version !== 'string' || !PREFERENCE_VERSION.test(data.version)) {
			throw new Error('Invalid preference version');
		}
		return data.version;
	}

	public static async getMeetingTimePreference(
		meetingTimeId: number | string
	): Promise<GetPreferencesResponse> {
		return requestJson(
			`/meeting_times/${meetingTimeId}/preference`,
			'Failed to load event preferences'
		);
	}

	// The same data as getMeetingTimePreference, for many meeting times in one
	// request, keyed by the id that was sent. The backend takes up to 200 ids.
	// Only an unsupported endpoint permits fallback. Outages and rate limits
	// must not multiply one failed batch into a request for every event.
	public static async getMeetingTimePreferences(
		meetingTimeIds: Array<number | string>
	): Promise<
		{ preferences: Record<string, GetPreferencesResponse>; version?: string } | undefined
	> {
		const response = await request('/meeting_times/preferences', {
			method: 'POST',
			body: { meeting_time_ids: meetingTimeIds.map(String) }
		});
		if (response.status === 404 || response.status === 405) return undefined;
		const data = await readJson<{
			preferences: Record<string, GetPreferencesResponse>;
			version?: string;
		}>(response, 'Failed to load event preferences');
		if (
			data.version !== undefined &&
			(typeof data.version !== 'string' || !PREFERENCE_VERSION.test(data.version))
		) {
			throw new Error('Invalid preference version');
		}
		return data;
	}

	public static async updateMeetingTimePreference(
		meetingTimeId: number | string,
		preferences: { event_preference: Partial<GetPreferencesResponse['resolved']> }
	): Promise<GetPreferencesResponse> {
		const response = await request(`/meeting_times/${meetingTimeId}/preference`, {
			method: 'PUT',
			body: preferences
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Update meeting time preference failed: ${response.status} ${response.statusText} - ${errorText}`
			);
		}
		return response.json();
	}

	// Notifications DND (Do Not Disturb) mode
	public static async getNotificationStatus(): Promise<{
		notifications_disabled: boolean;
		notifications_disabled_until: string | null;
	}> {
		return requestJson('/user/notifications', 'Failed to fetch the notification status');
	}

	public static async disableNotifications(
		duration?: number
	): Promise<{ notifications_disabled: boolean; notifications_disabled_until: string }> {
		return requestJson('/user/notifications', 'Failed to disable notifications', {
			method: 'PATCH',
			body: duration ? { disabled: true, duration } : { disabled: true }
		});
	}

	public static async enableNotifications(): Promise<{
		notifications_disabled: boolean;
		notifications_disabled_until: null;
	}> {
		return requestJson('/user/notifications', 'Failed to enable notifications', {
			method: 'PATCH',
			body: { disabled: false }
		});
	}

	// Connected Google accounts
	public static async getConnectedAccounts(): Promise<{ oauth_credentials: ConnectedAccount[] }> {
		return requestJson('/user/oauth_credentials', 'Failed to fetch the connected accounts');
	}

	public static async requestOAuthForEmail(
		email?: string
	): Promise<{ oauth_url?: string; calendar_id?: string; error?: string }> {
		const response = await request('/user/google_calendar', { method: 'POST', body: { email } });
		return response.json();
	}

	public static async disconnectAccount(credentialId: string): Promise<void> {
		await request(`/user/oauth_credentials/${credentialId}`, { method: 'DELETE' });
	}

	// University calendar preferences
	public static async getCalendarPreferences(): Promise<{
		global: any;
		uni_cal_global: {
			color_id?: string;
			reminder_settings?: { time: string | number; type: string; method: string }[] | null;
		} | null;
		event_types: Record<string, any>;
		uni_cal_categories: Record<string, any>;
	}> {
		return requestJson('/calendar_preferences', 'Failed to fetch the calendar preferences');
	}

	public static async setUniCalGlobalPreference(preferences: {
		color_id?: string;
		reminder_settings?: { time: string; type: string; method: string }[] | 'default';
	}): Promise<void> {
		const response = await request('/calendar_preferences/uni_cal', {
			method: 'PUT',
			body: { calendar_preference: preferences }
		});

		if (!response.ok) {
			throw new Error(`Failed to set university calendar preference (HTTP ${response.status})`);
		}
	}

	// Set the color for every university calendar event at once.
	// hexColor should be a lowercase #rrggbb hex string.
	//
	// This writes the one uni_cal preference that covers the whole university
	// calendar. Do not go back to writing one preference per category: that
	// needs a copy of the backend category list here, and an out of date copy
	// leaves the missing category on the default Graphite color. That is what
	// happened to Study Day in issue #498.
	public static async setAllUniCalCategoriesColor(hexColor: string): Promise<void> {
		await this.setUniCalGlobalPreference({ color_id: hexColor });
	}

	// The /passkey page holds no session. This mints a single-use, short-lived
	// grant it can spend to register a passkey, so the JWT never goes in a URL.
	public static async createPasskeyHandoff(): Promise<{ code: string }> {
		const response = await request('/user/passkeys/handoff', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});
		if (!response.ok) {
			throw new Error(`Could not start adding a passkey (${response.status})`);
		}
		return response.json();
	}

	public static async exchangePasskeyCode(code: string): Promise<{ jwt?: string }> {
		const baseUrl = await getBaseUrl();
		const response = await fetch(`${baseUrl}/user/passkeys/exchange`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		if (response.status === 401) {
			return {};
		}
		if (!response.ok) {
			throw new Error(`Passkey sign-in failed (${response.status})`);
		}
		return response.json();
	}

	public static async listPasskeys(): Promise<{ passkeys: PasskeySummary[] }> {
		const response = await request('/user/passkeys');
		if (!response.ok) {
			throw new Error(`Could not list passkeys (${response.status})`);
		}
		return response.json();
	}

	public static async deletePasskey(passkeyId: string): Promise<void> {
		const response = await request(`/user/passkeys/${passkeyId}`, { method: 'DELETE' });
		if (!response.ok) {
			throw new Error(`Could not remove the passkey (${response.status})`);
		}
	}
}
