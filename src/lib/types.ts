export type Weekday =
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday'
	| 'sunday';

export interface Building {
	name: string;
	abbreviation: string;
	pub_id?: string;
}

export interface Course {
	title: string;
	prefix: string;
	course_number: number;
	schedule_type: string;
	term: Term;
	professor: Professor | null;
	meeting_times: MeetingTime[];
}

export const FEATURE_FLAGS = [
	'debugMode',
	'envSwitcher',
	'finalsRetroactive',
	'bypassRateLimits'
] as const;

export interface FeatureFlagsResponse {
	feature_flags: Record<string, boolean>;
}

export interface Location {
	building: Building | null;
	rooms: string[];
}

export interface MeetingTime {
	id: number | string; // Can be internal ID or public_id
	begin_time: string;
	end_time: string;
	start_date: string | null;
	end_date: string | null;
	location: Location;
	monday: boolean;
	tuesday: boolean;
	wednesday: boolean;
	thursday: boolean;
	friday: boolean;
	saturday: boolean;
	sunday: boolean;
	color?: string;
	title_overrides?: Partial<Record<Weekday, string>>;
	calendar_config?: CalendarConfig;
}

export interface CalendarConfig {
	title: string;
	description?: string;
	color_id?: string;
	reminder_settings?: ReminderSettings[];
	visibility?: string;
}

export interface isProcessed {
	processed: boolean;
	status?: 'not_started' | 'pending' | 'processing' | 'processed' | 'failed';
	error_code?: string | null;
}

export interface FriendIdentity {
	id: string;
	name: string;
}

export type SharingLevel = 'full' | 'availability_only';

export interface FriendVisibility {
	mine: SharingLevel;
	theirs: SharingLevel;
}

export interface FriendVisibilityResponse extends FriendVisibility {
	friend_id: string;
}

export interface Friend extends FriendIdentity {
	expires_at?: string | null;
	visibility?: FriendVisibility | null;
}

export type FriendRequestInput = ({ friend_id: string } | { friend_email: string }) & {
	expires_at?: string | null;
	visibility?: SharingLevel;
};

export interface FriendExpiryResponse {
	friendship_id: string;
	status: 'pending' | 'accepted';
	expires_at: string | null;
	expiry_change: 'shortened' | 'proposed' | 'unchanged';
	friend: FriendIdentity;
}

export type MeetingLinkDuration = 15 | 30 | 45 | 60 | 90 | 120;
export interface MeetingLinkInput {
	starts_on: string;
	ends_on: string;
	duration_minutes: MeetingLinkDuration;
	title?: string;
	expires_at?: string;
}

export interface MeetingLink {
	id: string;
	title: string | null;
	starts_on: string;
	ends_on: string;
	duration_minutes: MeetingLinkDuration;
	expires_at: string;
	status: 'active' | 'used' | 'revoked' | 'expired';
	created_at: string;
	booking: {
		meeting_id: string;
		start_time: string;
		end_time: string;
		guest_name: string | null;
		guest_email: string | null;
	} | null;
}

export interface MeetingLinkCreateResponse {
	meeting_link: MeetingLink & { url: string };
}
export interface MeetingLinkResponse {
	meeting_link: MeetingLink;
}
export interface MeetingLinksResponse {
	meeting_links: MeetingLink[];
}

export interface FriendRequestIncoming {
	request_id: string;
	from: FriendIdentity;
	created_at: string;
	expires_at?: string | null;
}

export interface FriendRequestOutgoing {
	request_id: string;
	to: FriendIdentity;
	created_at: string;
	expires_at?: string | null;
}

export interface FriendListResponse {
	friends: Friend[];
}

export interface FriendRequestsResponse {
	incoming: FriendRequestIncoming[];
	outgoing: FriendRequestOutgoing[];
}

export interface FriendRequestCreateResponse {
	request_id: string;
	expires_at?: string | null;
}

export interface FriendRequestAcceptResponse {
	friendship_id: string;
	friend: FriendIdentity;
	expires_at?: string | null;
}

export interface OkResponse {
	ok: boolean;
}

export interface FriendProcessedEventsResponse {
	processed_courses: any[];
}

export interface Professor {
	first_name: string;
	last_name: string;
	email: string;
	rmp_id?: string;
	pub_id?: string;
}

export interface ResponseData {
	ics_url: string;
	classes: Course[];
}

export interface ProcessedEvents {
	classes: Course[];
}

export interface Term {
	uid: number;
	season: string;
	year: number;
	pub_id?: string;
}

export interface UserSettings {
	military_time: boolean;
	default_color_lecture: string;
	default_color_lab: string;
	advanced_editing: boolean;
	sync_university_events: boolean;
	university_event_categories: string[];
	available_university_event_categories?: UniversityEventCategory[];
	show_historic_terms: boolean;
	enrolled_terms?: Array<{ id: string; name: string }>;
}

export interface ConnectedAccount {
	id: string;
	email: string;
	provider: string;
	needs_reauth: boolean;
	token_revoked: boolean;
	has_calendar?: boolean;
}

export interface UniversityEventCategory {
	id: string;
	name: string;
	description: string;
}

export interface CurrentTerm {
	name: string;
	id: number;
	pub_id?: string;
	start_date?: string | null;
	end_date?: string | null;
}

// A term as GET /api/v1/catalog/terms/current and /next return it.
export interface CatalogTerm {
	uid: number;
	name: string;
	season: string;
	year: number;
	start_date?: string;
	end_date?: string;
	section_count?: number;
}

export interface TermResponse {
	current_term: CurrentTerm | null;
	next_term: CurrentTerm | null;
}

export interface DayItem {
	key: Weekday;
	label: string;
	abbr: string;
	order: number;
}

export interface EventPreferences {
	title_template: string;
	description_template: string;
	reminder_settings: ReminderSettings[];
	color_id: string;
	visibility: string;
}

export interface TemplateVariables {
	title: string;
	course_code: string;
	subject: string;
	course_number: string;
	section_number: string;
	crn: string;
	room: string;
	building: string;
	location: string;
	faculty: string;
	faculty_email: string;
	all_faculty: string;
	start_time: string;
	end_time: string;
	day: string;
	day_abbr: string;
	term: string;
	schedule_type: string;
	schedule_type_short?: string;
}

export interface ResolvedData {
	title_template: string;
	description_template: string;
	location_template: string;
	reminder_settings: ReminderSettings[];
	color_id: string;
	visibility: string;
}

export interface Preview {
	title: string;
	description: string;
	location: string;
}

export interface GetPreferencesResponse {
	notifications_disabled: boolean;
	individual_preference: EventPreferences;
	preview: Preview;
	templates: TemplateVariables;
	resolved: ResolvedData;
}

export interface ReminderSettings {
	time: number;
	method: string;
	type: NotificationType;
}

export type NotificationType = 'minutes' | 'hours' | 'days';
export type NotificationMethod = 'email' | 'notification';

export interface NotificationSetting {
	time: string;
	type: NotificationType;
	method: NotificationMethod;
}

export type ProcessingTerm = {
	term: string;
	courses: Array<{ crn: string; term: string; courseNumber: string }>;
};

export type BatchProcessingResponse = {
	user_pub: string;
	ics_url: string;
	terms: Array<{ term: string; status: 'processed' | 'pending' | 'failed'; error?: string }>;
};
