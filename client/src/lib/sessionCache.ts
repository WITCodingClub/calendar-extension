import { get, writable } from 'svelte/store';
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

export const settingsCache = writable<SettingsCache | undefined>(undefined);
export const friendsCache = writable<FriendsCache>({ friends: undefined, schedules: {} });
export const termsCache = writable<TermResponse | undefined>(undefined);

// A load that started before clearSessionCache() must not write its old
// result into the new, empty cache. Each load keeps the generation it started
// with and passes it back when it writes.
let generation = 0;

export function cacheGeneration(): number {
    return generation;
}

export function clearSessionCache(): void {
    generation++;
    settingsCache.set(undefined);
    friendsCache.set({ friends: undefined, schedules: {} });
    termsCache.set(undefined);
}

export function setSettingsCache(value: SettingsCache, startedAt: number): void {
    if (startedAt !== generation) return;
    settingsCache.set(value);
}

// Changes a loaded settings cache. Does nothing if no load finished yet, so a
// change can never make a partial cache look complete.
export function updateSettingsCache(patch: Partial<SettingsCache>): void {
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
