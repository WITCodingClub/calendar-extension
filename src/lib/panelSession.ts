import { getContext, setContext } from 'svelte';
import { API } from './api';
import type { PasskeySummary } from './passkeys';
import type { Course, FriendIdentity, TermResponse } from './types';

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

    settings: SettingsData | undefined;

    // Accepted friends. Friend requests are not kept, because they change when
    // other users act.
    friends: FriendIdentity[] | undefined;
    // Mapped courses by term id, then by friend id.
    readonly schedules: Record<string, Record<string, Course[]>> = {};

    #terms: Promise<TermResponse> | undefined;

    // Both pages need the terms. They share one request, and a failed request
    // is not kept, so the next call tries again.
    loadTerms(): Promise<TermResponse> {
        this.#terms ??= API.getTerms().catch((error) => {
            this.#terms = undefined;
            throw error;
        });
        return this.#terms;
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
