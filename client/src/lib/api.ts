import { EnvironmentManager } from "./environment";
import type { FeatureFlagsResponse, FriendListResponse, FriendProcessedEventsResponse, FriendRequestAcceptResponse, FriendRequestCreateResponse, FriendRequestsResponse, isProcessed, OkResponse, ProcessedEvents, UniversityCalendarEvent, UniversityEventCategoryWithCount, UserSettings } from "./types";

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

    public static async checkFeatureFlag(flagName:string) {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/flag_enabled?flag_name=${flagName}`, {
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
        const response = await fetch(`${baseUrl}/user/feature_flags`, {
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

    public static async getTerms() {
        const baseUrl = await this.getBaseUrl();
        const response = await fetch(`${baseUrl}/terms/current_and_next`, {
            method: 'GET'
        });
        return response.json();
    }

    public static async getUserEmail() {
        const baseUrl = await this.getBaseUrl();
        const response = await fetch(`${baseUrl}/user/email`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${await this.getJwtToken()}`
            }
        });
        return response.json();
    }

    public static async userSettings(settings?: UserSettings): Promise<UserSettings> {
        const baseUrl = await this.getBaseUrl();
        const url = `${baseUrl}/user/extension_config`;
        const token = await this.getJwtToken();
        const headers: HeadersInit = {
            'Authorization': `Bearer ${token}`
        };

        if (settings === undefined) {
            const response = await fetch(url, {
                method: 'GET',
                headers,
            });
            return response.json();
        } else {
            const response = await fetch(url, {
                method: 'PUT',
                body: JSON.stringify(settings),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
            return response.json();
        }
    }

    public static async userIsProcessed(termUid: string): Promise<isProcessed> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/is_processed`, {
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
        const response = await fetch(`${baseUrl}/user/processed_events`, {
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
        const response = await fetch(`${baseUrl}/friends`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async getFriendRequests(): Promise<FriendRequestsResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/friends/requests`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async createFriendRequest(friendId: string): Promise<FriendRequestCreateResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/friends/requests`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ friend_id: friendId })
        });
        return response.json();
    }

    public static async acceptFriendRequest(requestId: string): Promise<FriendRequestAcceptResponse> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/friends/requests/${requestId}/accept`, {
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
        const response = await fetch(`${baseUrl}/friends/requests/${requestId}/decline`, {
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
        const response = await fetch(`${baseUrl}/friends/requests/${requestId}`, {
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
        const response = await fetch(`${baseUrl}/friends/${friendId}`, {
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
        const response = await fetch(`${baseUrl}/friends/${friendId}/is_processed`, {
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
        const response = await fetch(`${baseUrl}/friends/${friendId}/processed_events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ term_uid: termUid })
        });
        return response.json();
    }

    public static async getIcsUrl(): Promise<{ ics_url: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/ics_url`, {
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
        const response = await fetch(`${baseUrl}/university_calendar_events/categories`, {
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
        const response = await fetch(url, {
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
        const response = await fetch(url, {
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
        const response = await fetch(`${baseUrl}/process_courses`, {
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
        const response = await fetch(`${baseUrl}/courses/reprocess`, {
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
        const response = await fetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
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

    public static async updateMeetingTimePreference(meetingTimeId: number | string, preferences: any): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
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
        const response = await fetch(`${baseUrl}/meeting_times/${meetingTimeId}/preference`, {
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
        const response = await fetch(`${baseUrl}/user/notifications_status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async disableNotifications(duration?: number): Promise<{ notifications_disabled: boolean; notifications_disabled_until: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const body = duration ? JSON.stringify({ duration }) : undefined;
        const response = await fetch(`${baseUrl}/user/notifications/disable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body
        });
        return response.json();
    }

    public static async enableNotifications(): Promise<{ notifications_disabled: boolean; notifications_disabled_until: null }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/notifications/enable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return response.json();
    }

    // Global calendar preferences
    public static async getGlobalCalendarPreference(): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/calendar_preferences/global`, {
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
        const response = await fetch(`${baseUrl}/calendar_preferences/global`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendar_preference: preferences })
        });
        return response.json();
    }

    // Connected Google accounts
    public static async getConnectedAccounts(): Promise<{ oauth_credentials: Array<{id: string, email: string, provider: string, needs_reauth: boolean, token_revoked: boolean}> }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/oauth_credentials`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async requestOAuthForEmail(email: string): Promise<{ oauth_url?: string, calendar_id?: string, error?: string }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/user/gcal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        return response.json();
    }

    public static async disconnectAccount(credentialId: string): Promise<void> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        await fetch(`${baseUrl}/user/oauth_credentials/${credentialId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    }

    // University calendar preferences
    public static async getCalendarPreferences(): Promise<{
        global: any;
        event_types: Record<string, any>;
        uni_cal_categories: Record<string, any>;
    }> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/calendar_preferences`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.json();
    }

    public static async setUniCalCategoryPreference(category: string, preferences: {
        color_id?: string;
        title_template?: string;
        description_template?: string;
    }): Promise<any> {
        const baseUrl = await this.getBaseUrl();
        const token = await this.getJwtToken();
        const response = await fetch(`${baseUrl}/calendar_preferences/uni_cal:${category}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendar_preference: preferences })
        });
        return response.json();
    }

    // Set color for all university calendar categories at once
    // colorId should be a Google Calendar color ID (1-11)
    public static async setAllUniCalCategoriesColor(colorId: string): Promise<void> {
        const categories = [
            'holiday', 'term_dates', 'registration', 'deadline', 'finals',
            'graduation', 'academic', 'campus_event', 'meeting', 'exhibit',
            'announcement', 'other'
        ];
        await Promise.all(
            categories.map(cat => this.setUniCalCategoryPreference(cat, { color_id: colorId }))
        );
    }

}