import { EnvironmentManager } from './environment';

/**
 * Anonymous usage counts for the WIT Calendar Grafana server.
 *
 * Each request sends one event name from the list below, the extension version,
 * and the browser name. It sends no token, no email, and no schedule data, and
 * the backend keeps only a count per event name.
 *
 * Keep this list in sync with ExtensionUsage::EVENTS in calendar-backend. The
 * backend ignores a name that is not on its list.
 */
export const TELEMETRY_EVENTS = [
    'sign_in_google_succeeded',
    'sign_in_google_failed',
    'sign_in_wrong_account',
    'sign_in_passkey_succeeded',
    'sign_in_passkey_failed',
    'passkey_created',
    'passkey_setup_skipped',
    'calendar_choice_google',
    'calendar_choice_other',
    'google_calendar_connected',
    'schedule_import_succeeded',
    'schedule_import_failed',
    'calendar_link_copied'
] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export type Browser = 'chrome' | 'firefox' | 'edge';

const PREFERENCE_KEY = 'usage_stats_enabled';

/**
 * Firefox asks for this data type itself, at install time and in its add-on
 * settings. It must be optional, so the extension reads the answer from the
 * permissions API instead of from its own setting.
 */
const FIREFOX_DATA_PERMISSION = 'technicalAndInteraction';

type DataCollectionPermissions = chrome.permissions.Permissions & { data_collection?: string[] };

export function detectBrowser(userAgent: string = navigator.userAgent): Browser {
    if (userAgent.includes('Firefox/')) return 'firefox';
    if (userAgent.includes('Edg/')) return 'edge';
    return 'chrome';
}

/** Chrome and Edge: on unless the student turns it off. Firefox: only with consent. */
export async function usageStatsEnabled(): Promise<boolean> {
    try {
        if (detectBrowser() === 'firefox') {
            const permissions = (await chrome.permissions.getAll()) as DataCollectionPermissions;
            return permissions.data_collection?.includes(FIREFOX_DATA_PERMISSION) ?? false;
        }

        const stored = await chrome.storage.local.get(PREFERENCE_KEY);
        return stored[PREFERENCE_KEY] !== false;
    } catch {
        return false;
    }
}

/**
 * Turns the usage counts on or off, and returns the new state. Call it straight
 * from the click handler: Firefox shows its permission prompt only while it can
 * see the click, and an await before the request loses it.
 */
export async function setUsageStatsEnabled(enabled: boolean): Promise<boolean> {
    if (detectBrowser() === 'firefox') {
        const permission = { data_collection: [FIREFOX_DATA_PERMISSION] } as chrome.permissions.Permissions;
        if (enabled) {
            return chrome.permissions.request(permission);
        }
        await chrome.permissions.remove(permission);
        return usageStatsEnabled();
    }

    await chrome.storage.local.set({ [PREFERENCE_KEY]: enabled });
    return enabled;
}

/**
 * Sends one usage event. It never throws and never waits for the student: a
 * failed send is dropped. keepalive lets the request finish if the side panel
 * closes first.
 */
export async function track(event: TelemetryEvent): Promise<void> {
    try {
        if (!(await usageStatsEnabled())) return;

        const baseUrl = await EnvironmentManager.getBaseUrl();
        await fetch(`${baseUrl}/api/extension_events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                events: [event],
                version: chrome.runtime.getManifest().version,
                browser: detectBrowser()
            }),
            keepalive: true
        });
    } catch {
        // Usage counts are best effort.
    }
}
