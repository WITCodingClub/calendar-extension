interface Building {
    name: string;
    abbreviation: string;
    pub_id?: string;
}

interface Course {
    title: string;
    prefix: string;
    course_number: number;
    schedule_type: string;
    term: Term;
    professor: Professor;
    meeting_times: MeetingTime[];
}

const FEATURE_FLAGS = [
    "v1",
    "v2",
    "debugMode",
    "envSwitcher",
    "finalsRetroactive",
    "bypassRateLimits"
] as const;

interface FeatureFlagEnabled {
    feature_name: string;
    is_enabled: boolean;
}

interface FeatureFlagsResponse {
    feature_flags: Record<string, boolean>;
}

interface Location {
    building: Building;
    room: string;
}

interface MeetingTime {
    id: number | string;  // Can be internal ID or public_id
    begin_time: string;
    end_time: string;
    start_date: string;
    end_date: string;
    location: Location;
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
    color?: string;
    title_overrides?: Partial<Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', string>>;
    calendar_config?: CalendarConfig;
}

interface CalendarConfig {
    title: string;
    description?: string;
    color_id?: string;
    reminder_settings?: ReminderSettings[];
    visibility?: string;
}

interface isProcessed {
    processed: boolean;
}

interface Professor {
    first_name: string;
    last_name: string;
    email: string;
    rmp_id?: string;
    pub_id?: string;
}

interface ResponseData {
    ics_url: string;
    classes: Course[];
}

interface ProcessedEvents {
    classes: Course[];
}

interface Term {
    uid: number;
    season: string;
    year: number;
    pub_id?: string;
}

interface UserSettings {
    military_time: boolean;
    default_color_lecture: string;
    default_color_lab: string;
    advanced_editing: boolean;
    sync_university_events: boolean;
    university_event_categories: string[];
    available_university_event_categories?: UniversityEventCategory[];
    show_historic_terms: boolean;
}

interface UniversityEventCategory {
    id: string;
    name: string;
    description: string;
}

interface UniversityEventCategoryWithCount {
    id: string;
    name: string;
    count: number;
}

interface UniversityCalendarEvent {
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start_time: string;
    end_time: string;
    all_day: boolean;
    category: string;
    organization?: string;
    academic_term?: string;
    term_id?: string;
    excludes_classes: boolean;
    formatted_date: string;
    created_at: string;
    updated_at: string;
}

interface CurrentTerm {
    name: string;
    id: number;
    pub_id?: string;
    start_date?: string;
    end_date?: string;
}

interface NextTerm {
    name: string;
    id: number;
    pub_id?: string;
    start_date?: string;
    end_date?: string;
}

interface TermResponse {
    current_term: CurrentTerm;
    next_term: NextTerm;
}

interface DayItem {
    key: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    label: string;
    abbr: string;
    order: number;
}

interface EventPreferences {
    title_template: string;
    description_template: string;
    reminder_settings: ReminderSettings[];
    color_id: string;
    visibility: string;
}

interface TemplateVariables {
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
}

interface ResolvedData {
    title_template: string;
    description_template: string;
    location_template: string;
    reminder_settings: ReminderSettings[];
    color_id: string;
    visibility: string;
}

interface Preview {
    title: string;
    description: string;
    location: string;
}

interface GetPreferencesResponse {
	notifications_disabled: boolean;
    individual_preference: EventPreferences;
    preview: Preview;
    templates: TemplateVariables;
    resolved: ResolvedData;
}

interface ReminderSettings {
    time: number;
    method: string;
    type: NotificationType;
}

type NotificationType = "minutes" | "hours" | "days";
type NotificationMethod = "email" | "notification";

interface NotificationSetting {
    time: string;
    type: NotificationType;
    method: NotificationMethod;
}

export {
    FEATURE_FLAGS,
    type Building,
    type CalendarConfig, type Course, type CurrentTerm, type DayItem,
    type EventPreferences, type FeatureFlagsResponse, type GetPreferencesResponse, type isProcessed, type Location,
    type MeetingTime, type NextTerm, type NotificationMethod, type NotificationSetting, type NotificationType, type Preview, type ProcessedEvents, type Professor, type ReminderSettings, type ResolvedData, type ResponseData, type TemplateVariables, type Term, type TermResponse, type UniversityCalendarEvent, type UniversityEventCategory, type UniversityEventCategoryWithCount, type UserSettings
};
