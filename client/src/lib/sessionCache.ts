import { get, writable } from 'svelte/store';
import type { Environment } from './environment';
import { featureFlags } from './featureFlags';
import type { PasskeySummary } from './passkeys';
import type { Course, FriendIdentity, TermResponse } from './types';

// Data that the side panel loads once each time it opens. These stores live
// only in memory. When the panel closes, its page ends and the stores reset,
// so the next open loads fresh data. Nothing here goes into localStorage.

export type ConnectedAccount = {
    id: string;
    email: string;
    provider: string;
    needs_reauth: boolean;
    token_revoked: boolean;
};

export type SettingsCache = {
    email: string | undefined;
    notificationsDisabled: boolean;
    connectedAccounts: ConnectedAccount[];
    canUsePasskeys: boolean;
    passkeys: PasskeySummary[];
    uniCalColor: string;
};

export type FriendsCache = {
    // Accepted friends. Friend requests are not cached, because they change
    // when other users act.
    friends: FriendIdentity[] | undefined;
    // Mapped courses by term id, then by friend id.
    schedules: Record<string, Record<string, Course[]>>;
};

// The calendar page state that a move to another page must not lose. The
// router destroys the page component, but the panel session goes on, so the
// page must not ask for the same data again when the user comes back.
export type CalendarSession = {
    // True after the terms and the user settings loaded without a failure.
    loaded: boolean;
    // Terms whose processed events this session already asked for.
    attemptedTerms: Set<string>;
    // Terms whose meeting time preferences this session already refreshed.
    refreshedTerms: Set<string>;
};

export const settingsCache = writable<SettingsCache | undefined>(undefined);
export const friendsCache = writable<FriendsCache>({ friends: undefined, schedules: {} });
export const termsCache = writable<TermResponse | undefined>(undefined);

function emptyCalendarSession(): CalendarSession {
    return { loaded: false, attemptedTerms: new Set(), refreshedTerms: new Set() };
}

let calendarSession = emptyCalendarSession();

// A load that started before clearSessionCache() must not write its old
// result into the new, empty cache. Each load keeps the generation it started
// with and passes it back when it writes.
let generation = 0;

// Every cached value belongs to one environment.
let cacheEnvironment: Environment | undefined;

export function cacheGeneration(): number {
    return generation;
}

export function clearSessionCache(): void {
    generation++;
    cacheEnvironment = undefined;
    settingsCache.set(undefined);
    friendsCache.set({ friends: undefined, schedules: {} });
    termsCache.set(undefined);
    calendarSession = emptyCalendarSession();
    // The feature flags keep their own cache, and their values differ between
    // environments, so this reset has to reach them too.
    featureFlags.clearCache();
}

// Binds the cache to an environment. A page calls this before it reads the
// cache. When the environment changed, the cache empties first, so the panel
// can never show the data of the environment that the user left.
export function useEnvironment(environment: Environment): void {
    if (cacheEnvironment !== undefined && cacheEnvironment !== environment) {
        clearSessionCache();
    }
    cacheEnvironment = environment;
}

export function setSettingsCache(value: SettingsCache, startedAt: number): void {
    if (startedAt !== generation) return;
    settingsCache.set(value);
}

// Changes a loaded settings cache. Does nothing if no load finished yet, so a
// change can never make a partial cache look complete. A caller that runs as
// part of a load passes the generation it started with, so a late reply cannot
// write into the cache of a newer generation. A user action on the loaded page
// belongs to the current generation and passes nothing.
export function updateSettingsCache(patch: Partial<SettingsCache>, startedAt?: number): void {
    if (startedAt !== undefined && startedAt !== generation) return;
    settingsCache.update((cache) => (cache ? { ...cache, ...patch } : cache));
}

export function setCachedFriends(friends: FriendIdentity[], startedAt: number): void {
    if (startedAt !== generation) return;
    friendsCache.update((cache) => ({ ...cache, friends }));
}

export function getCachedSchedule(termId: string, friendId: string): Course[] | undefined {
    return get(friendsCache).schedules[termId]?.[friendId];
}

export function setCachedSchedule(termId: string, friendId: string, courses: Course[], startedAt: number): void {
    if (startedAt !== generation) return;
    friendsCache.update((cache) => ({
        ...cache,
        schedules: {
            ...cache.schedules,
            [termId]: { ...cache.schedules[termId], [friendId]: courses }
        }
    }));
}

export function setCachedTerms(terms: TermResponse, startedAt: number): void {
    if (startedAt !== generation) return;
    termsCache.set(terms);
}

export function getCalendarSession(): CalendarSession {
    return calendarSession;
}

export function markCalendarLoaded(startedAt: number): void {
    if (startedAt !== generation) return;
    calendarSession.loaded = true;
}

export function markTermAttempted(termId: string): void {
    calendarSession.attemptedTerms.add(termId);
}

export function markTermRefreshed(termId: string): void {
    calendarSession.refreshedTerms.add(termId);
}
