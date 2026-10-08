import { getContext, setContext } from 'svelte';
import { API } from './api';
import { PreferenceCache } from './preferenceCache';
import type { PasskeySummary } from './passkeys';
import type { Course, Friend, ProcessedEvents, TermResponse } from './types';

export type ConnectedAccount = {
    id: string;
    email: string;
    provider: string;
    needs_reauth: boolean;
    token_revoked: boolean;
};

export type SettingsData = {
    email: string | undefined;
    notificationsDisabled: boolean;
    connectedAccounts: ConnectedAccount[];
    canUsePasskeys: boolean;
    passkeys: PasskeySummary[];
    uniCalColor: string;
    uniCalReminderMode: "default" | "off" | "custom";
    uniCalReminderOffset: string;
};

// The data that the calendar and friends pages load once. The (panel) layout
// owns one session and keeps it while the user moves between those pages.
// The session ends when the panel closes, when the user leaves those pages,
// or when the environment changes. A reply that arrives after that writes into
// the old session, which no page reads.
export class PanelSession {
    // False after the session ended. Check it before a write to a store that
    // outlives the session, such as userSettings.
    active = true;

    // True after the calendar page loaded the user settings.
    calendarLoaded = false;
    // Terms whose processed events this session already asked for.
    readonly attemptedTerms = new Set<string>();
    // Terms whose meeting time preferences loaded in this session.
    readonly refreshedTerms = new Set<string>();
    readonly preferences = new PreferenceCache(() => API.getPreferenceVersion());

    settings: SettingsData | undefined;

    // Accepted friends. Friend requests are not kept, because they change when
    // other users act.
    friends: Friend[] | undefined;
    // Mapped courses by term id, then by friend id.
    readonly schedules: Record<string, Record<string, Course[]>> = {};

    #terms: Promise<TermResponse> | undefined;
    #processed = new Map<string, Promise<ProcessedEvents>>();
    readonly ownScheduleVersions: Record<string, number> = {};

    invalidateOwnSchedule(term: string): void {
        this.ownScheduleVersions[term] = (this.ownScheduleVersions[term] ?? 0) + 1;
        this.#processed.delete(term);
        this.preferences.invalidateTerm(term);
        this.refreshedTerms.delete(term);
    }

    loadProcessedEvents(term: string): Promise<ProcessedEvents> {
        const pending = this.#processed.get(term);
        if (pending) return pending;
        const request = API.getProcessedEvents(term).finally(() => {
            if (this.#processed.get(term) === request) this.#processed.delete(term);
        });
        this.#processed.set(term, request);
        return request;
    }

    // Both pages need the terms. They share one request, and a failed request
    // is not kept, so the next call tries again.
    loadTerms(force = false): Promise<TermResponse> {
        if (force) this.#terms = undefined;
        if (this.#terms) return this.#terms;
        const request = API.getTerms().catch((error) => {
            if (this.#terms === request) this.#terms = undefined;
            throw error;
        });
        this.#terms = request;
        return request;
    }

    // Changes loaded settings data. Does nothing before a full load, so a
    // change never makes partial data look complete.
    updateSettings(patch: Partial<SettingsData>): void {
        if (this.settings) {
            this.settings = { ...this.settings, ...patch };
        }
    }
}

const KEY = Symbol('panelSession');

export function setPanelSession(current: () => PanelSession): void {
    setContext(KEY, current);
}

// Call during component setup. The layout mounts the pages again when it
// starts a new session, so a component keeps one session for its whole life.
export function getPanelSession(): PanelSession {
    return getContext<() => PanelSession>(KEY)();
}
