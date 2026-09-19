import { EnvironmentManager } from "./environment";
import { AuthError, handleUnauthorized, isUsableJwt } from "./auth";
import type { FeatureFlagsResponse, FriendListResponse, FriendProcessedEventsResponse, FriendRequestAcceptResponse, FriendRequestCreateResponse, FriendRequestsResponse, GetPreferencesResponse, isProcessed, MicrosoftCalendarOAuthResponse, OAuthCredentialsResponse, OkResponse, ProcessedEvents, TermResponse, UniversityCalendarEvent, UniversityEventCategoryWithCount, UserSettings } from "./types";
import type { PasskeySummary } from "./passkeys";

// A failed API request. The status lets callers tell a 404 from other errors.
export class ApiRequestError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
    }
}

export class API {
    private static async getBaseUrl(): Promise<string> {
        const baseUrl = await EnvironmentManager.getBaseUrl();
        return `${baseUrl}/api`;
    }

    public static get baseUrl(): Promise<string> {
        return this.getBaseUrl();
    }

    public static async getJwtToken(): Promise<string | undefined> {
        const token = await EnvironmentManager.getJwtToken();
        return token;
    }

    private static async authedFetch(url: string, init?: RequestInit): Promise<Response> {
        const token = await this.getJwtToken();
        if (!isUsableJwt(token)) {
            await handleUnauthorized();
            throw new AuthError();
        }

        const sentAuth = new Headers(init?.headers).get('Authorization');
        const response = await fetch(url, init);
        if (response.status === 401) {
            const currentToken = await this.getJwtToken();
            if (currentToken && sentAuth === `Bearer ${currentToken}`) {
                await handleUnauthorized();
            }
            throw new AuthError();
        }
        return response;
    }

    // Reads the body of a response that must succeed. A failed response becomes
    // an ApiRequestError, so a caller never mistakes an error body for data and
    // never writes one into a cache.
    private static async readJson<T>(response: Response, failureMessage: string): Promise<T> {
        if (response.ok) {
            return response.json();
        }
        let message = `${failureMessage}: ${response.status}`;
        try {
            const body = await response.json();
            if (body?.error) message = String(body.error);
            else if (body?.message) message = String(body.message);
            else if (body?.detail) message = String(body.detail);
        } catch {
            /* ignore parse errors */
        }
        throw new ApiRequestError(message, response.status);
    }

    public static async checkFeatureFlag(flagName:string) {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/flag_enabled?flag_name=${flagName}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error(`Feature flag API error for ${flagName}:`, response.status, response.statusText);
        }

        const data = await response.json();
        return data.is_enabled;
    }

    public static async getAllFeatureFlags(): Promise<FeatureFlagsResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/feature_flags`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error('Feature flags API error:', response.status, response.statusText);
            throw new Error(`Failed to fetch feature flags: ${response.status}`);
        }

        return response.json();
    }

    public static async getTerms(): Promise<TermResponse> {
        const baseUrl = await this.getBaseUrl();
        const response = await fetch(`${baseUrl}/terms/current_and_next`, {
            method: 'GET'
        });
        return this.readJson(response, 'Failed to fetch terms');
    }

    public static async getUserEmail(): Promise<{ email: string }> {
        const baseUrl = await this.getBaseUrl();
        const response = await this.authedFetch(`${baseUrl}/user/email`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${await this.getJwtToken()}`
            }
        });
        return this.readJson(response, 'Failed to fetch the user email');
    }

    public static async userSettings(settings?: UserSettings): Promise<UserSettings> {
        const baseUrl = await this.getBaseUrl();
        const url = `${baseUrl}/user/extension_config`;
        const token = await this.getJwtToken();
        const headers: HeadersInit = {
            'Authorization': `Bearer ${token}`
        };

        if (settings === undefined) {
            const response = await this.authedFetch(url, {
                method: 'GET',
                headers,
            });
            return this.readJson(response, 'Failed to fetch the user settings');
        } else {
            const response = await this.authedFetch(url, {
                method: 'PUT',
                body: JSON.stringify(settings),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
            return this.readJson(response, 'Failed to save the user settings');
        }
    }

    public static async userIsProcessed(termUid: string): Promise<isProcessed> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/is_processed`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ term_uid: termUid })
        });
        return response.json();
    }

    public static async getProcessedEvents(termUid: string): Promise<ProcessedEvents> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/processed_events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ term_uid: termUid })
        });
        return response.json();
    }

    public static async getFriends(): Promise<FriendListResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return this.readJson(response, 'Failed to fetch friends');
    }

    public static async getFriendRequests(): Promise<FriendRequestsResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async createFriendRequest(
        payload: { friend_id: string } | { friend_email: string }
    ): Promise<FriendRequestCreateResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/requests`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        return this.readJson(response, 'Failed to send the friend request');
    }

    public static async acceptFriendRequest(requestId: string): Promise<FriendRequestAcceptResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/requests/${requestId}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async declineFriendRequest(requestId: string): Promise<OkResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/requests/${requestId}/decline`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async cancelFriendRequest(requestId: string): Promise<OkResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/requests/${requestId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async removeFriend(friendId: string): Promise<OkResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/${friendId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async friendIsProcessed(friendId: string, termUid: string): Promise<isProcessed> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/${friendId}/is_processed`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ term_uid: termUid })
        });
        return response.json();
    }

    public static async getFriendProcessedEvents(friendId: string, termUid: string): Promise<FriendProcessedEventsResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/friends/${friendId}/processed_events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ term_uid: termUid })
        });
        return this.readJson(response, `Failed to fetch the schedule of friend ${friendId}`);
    }

    public static async getIcsUrl(): Promise<{ ics_url: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/ics_url`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async getUniversityEventCategories(): Promise<{ categories: UniversityEventCategoryWithCount[] }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/university_calendar_events/categories`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async getUniversityEvents(params?: { category?: string; categories?: string; start_date?: string; end_date?: string; term_id?: string; page?: number; per_page?: number }): Promise<{ events: UniversityCalendarEvent[]; meta: { current_page: number; total_pages: number; total_count: number; per_page: number } }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const searchParams = new URLSearchParams();
        if (params?.category) searchParams.append('category', params.category);
        if (params?.categories) searchParams.append('categories', params.categories);
        if (params?.start_date) searchParams.append('start_date', params.start_date);
        if (params?.end_date) searchParams.append('end_date', params.end_date);
        if (params?.term_id) searchParams.append('term_id', params.term_id);
        if (params?.page) searchParams.append('page', params.page.toString());
        if (params?.per_page) searchParams.append('per_page', params.per_page.toString());

        const url = `${baseUrl}/university_calendar_events${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
        const response = await this.authedFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async getHolidays(params?: { term_id?: string; start_date?: string; end_date?: string }): Promise<{ holidays: UniversityCalendarEvent[] }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const searchParams = new URLSearchParams();
        if (params?.term_id) searchParams.append('term_id', params.term_id);
        if (params?.start_date) searchParams.append('start_date', params.start_date);
        if (params?.end_date) searchParams.append('end_date', params.end_date);

        const url = `${baseUrl}/university_calendar_events/holidays${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
        const response = await this.authedFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    // Course processing endpoints
    public static async processCourses(courses: any[]): Promise<{ user_pub: string; ics_url: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/process_courses`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(courses)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Process courses failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    }

    public static async reprocessCourses(courses: any[]): Promise<{
        ics_url: string;
        removed_enrollments: number;
        removed_courses: Array<{ crn: number; title: string; course_number: number }>;
        processed_courses: any[];
    }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/courses/reprocess`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ courses })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Reprocess courses failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    }

    // Event preferences endpoints
    public static async getMeetingTimePreference(meetingTimeId: number | string): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            return undefined;
        }
        return response.json();
    }

    // The same data as getMeetingTimePreference, for many meeting times in one
    // request, keyed by the id that was sent. The backend takes up to 200 ids.
    // Returns undefined when the request fails, for example on a backend that
    // does not have this endpoint yet, so the caller can ask for each id instead.
    public static async getMeetingTimePreferences(meetingTimeIds: Array<number | string>): Promise<Record<string, GetPreferencesResponse> | undefined> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/meeting_times/preferences`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ meeting_time_ids: meetingTimeIds.map(String) })
        });
        if (!response.ok) {
            return undefined;
        }
        const data = await response.json();
        return data.preferences;
    }

    public static async updateMeetingTimePreference(meetingTimeId: number | string, preferences: any): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferences)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Update meeting time preference failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        return response.json();
    }

    public static async deleteMeetingTimePreference(meetingTimeId: number | string): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    // Notifications DND (Do Not Disturb) mode
    public static async getNotificationStatus(): Promise<{ notifications_disabled: boolean; notifications_disabled_until: string | null }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/notifications_status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return this.readJson(response, 'Failed to fetch the notification status');
    }

    public static async disableNotifications(duration?: number): Promise<{ notifications_disabled: boolean; notifications_disabled_until: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const body = duration ? JSON.stringify({ duration }) : undefined;
        const response = await this.authedFetch(`${baseUrl}/user/notifications/disable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body
        });
        return this.readJson(response, 'Failed to disable notifications');
    }

    public static async enableNotifications(): Promise<{ notifications_disabled: boolean; notifications_disabled_until: null }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/notifications/enable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return this.readJson(response, 'Failed to enable notifications');
    }

    // Global calendar preferences
    public static async getGlobalCalendarPreference(): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/calendar_preferences/global`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async setGlobalCalendarPreference(preferences: {
        reminder_settings?: any[];
        title_template?: string;
        description_template?: string;
        color_id?: string;
    }): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/calendar_preferences/global`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendar_preference: preferences })
        });
        return response.json();
    }

    // Connected calendar accounts (Google and Microsoft)
    public static async getConnectedAccounts(): Promise<OAuthCredentialsResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/oauth_credentials`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return this.readJson(response, 'Failed to fetch the connected accounts');
    }

    public static async requestOAuthForEmail(email: string): Promise<{ oauth_url?: string, calendar_id?: string, error?: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/gcal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        return response.json();
    }

    // Starts the Outlook (Microsoft Graph) calendar connection. Open the returned
    // oauth_url in a popup, like the Google flow. The backend answers 404 while
    // the microsoftGraphCalendar flag is off for this user.
    public static async requestMicrosoftCalendarOAuth(): Promise<MicrosoftCalendarOAuthResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/microsoft_calendar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return this.readJson(response, 'Could not start the Outlook calendar connection');
    }

    // Disconnects a Google or Microsoft credential. Throws with the backend
    // reason, for example when it is the last credential.
    public static async disconnectAccount(credentialId: string): Promise<void> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/user/oauth_credentials/${credentialId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        await this.readJson(response, 'Could not disconnect the account');
    }

    // University calendar preferences
    public static async getCalendarPreferences(): Promise<{
        global: any;
        uni_cal_global: { color_id?: string } | null;
        event_types: Record<string, any>;
        uni_cal_categories: Record<string, any>;
    }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/calendar_preferences`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return this.readJson(response, 'Failed to fetch the calendar preferences');
    }

    public static async setUniCalCategoryPreference(category: string, preferences: {
        color_id?: string;
        title_template?: string;
        description_template?: string;
    }): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/calendar_preferences/uni_cal:${category}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendar_preference: preferences })
        });
        return response.json();
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
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await this.authedFetch(`${baseUrl}/calendar_preferences/uni_cal`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendar_preference: { color_id: hexColor } })
        });

        if (!response.ok) {
            throw new Error(`Failed to set university calendar color (HTTP ${response.status})`);
        }
    }

    // The /passkey page holds no session. This mints a single-use, short-lived
    // grant it can spend to register a passkey, so the JWT never goes in a URL.
    public static async createPasskeyHandoff(): Promise<{ code: string }> {
        const baseUrl = await this.getBaseUrl();
        const response = await this.authedFetch(`${baseUrl}/user/passkeys/handoff`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getJwtToken()}`
            }
        });
        if (!response.ok) {
            throw new Error(`Could not start adding a passkey (${response.status})`);
        }
        return response.json();
    }

    public static async exchangePasskeyCode(code: string): Promise<{ jwt?: string }> {
        const baseUrl = await this.getBaseUrl();
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
        const baseUrl = await this.getBaseUrl();
        const response = await this.authedFetch(`${baseUrl}/user/passkeys`, {
            headers: { 'Authorization': `Bearer ${await this.getJwtToken()}` }
        });
        if (!response.ok) {
            throw new Error(`Could not list passkeys (${response.status})`);
        }
        return response.json();
    }

    public static async deletePasskey(passkeyId: string): Promise<void> {
        const baseUrl = await this.getBaseUrl();
        const response = await this.authedFetch(`${baseUrl}/user/passkeys/${passkeyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${await this.getJwtToken()}` }
        });
        if (!response.ok) {
            throw new Error(`Could not remove the passkey (${response.status})`);
        }
    }

}