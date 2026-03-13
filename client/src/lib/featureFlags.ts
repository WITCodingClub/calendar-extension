import { derived, writable } from 'svelte/store';
import { API } from './api';
import { FEATURE_FLAGS } from './types';

type FeatureFlagName = typeof FEATURE_FLAGS[number];
type FeatureFlagsState = Record<FeatureFlagName, boolean>;


const featureFlagsStore = writable<FeatureFlagsState | null>(null);
export const isLoadingFeatureFlags = writable<boolean>(false);
export const featureFlagsError = writable<Error | null>(null);

class FeatureFlagsService {
    private cache: FeatureFlagsState | null = null;
    private loadPromise: Promise<void> | null = null;

    async loadFlags(force: boolean = false): Promise<void> {
        if (this.loadPromise && !force) {
            return this.loadPromise;
        }

        if (this.cache && !force) {
            featureFlagsStore.set(this.cache);
            return;
        }

        this.loadPromise = this._fetchFlags();
        return this.loadPromise;
    }

    private async _fetchFlags(): Promise<void> {
        isLoadingFeatureFlags.set(true);
        featureFlagsError.set(null);

        try {
            const response = await API.getAllFeatureFlags();
            const flags: FeatureFlagsState = {} as FeatureFlagsState;

            // Map the response to our FeatureFlagsState type
            for (const flagName of FEATURE_FLAGS) {
                flags[flagName as FeatureFlagName] = response.feature_flags[flagName] ?? false;
            }

            this.cache = flags;
            featureFlagsStore.set(flags);
        } catch (error) {
            const err = error instanceof Error ? error : new Error('Failed to load feature flags');
            featureFlagsError.set(err);
            console.error('Error loading feature flags:', error);

            // Set all flags to false on error
            const flags: FeatureFlagsState = {} as FeatureFlagsState;
            for (const flagName of FEATURE_FLAGS) {
                flags[flagName as FeatureFlagName] = false;
            }
            this.cache = flags;
            featureFlagsStore.set(flags);
        } finally {
            isLoadingFeatureFlags.set(false);
            this.loadPromise = null;
        }
    }

    async isEnabled(flagName: FeatureFlagName): Promise<boolean> {
        if (!this.cache) {
            await this.loadFlags();
        }
        return this.cache?.[flagName] ?? false;
    }

    isEnabledSync(flagName: FeatureFlagName): boolean {
        return this.cache?.[flagName] ?? false;
    }

    async checkMultiple(flagNames: FeatureFlagName[]): Promise<Record<string, boolean>> {
        if (!this.cache) {
            await this.loadFlags();
        }

        const results: Record<string, boolean> = {};
        for (const flagName of flagNames) {
            results[flagName] = this.cache?.[flagName] ?? false;
        }
        return results;
    }

    async getAllFlags(): Promise<FeatureFlagsState> {
        if (!this.cache) {
            await this.loadFlags();
        }
        return this.cache ?? ({} as FeatureFlagsState);
    }

    clearCache(): void {
        this.cache = null;
        featureFlagsStore.set(null);
    }

    async reload(): Promise<void> {
        return this.loadFlags(true);
    }
}

export const featureFlags = new FeatureFlagsService();

export const featureFlagsStore$ = derived(
    featureFlagsStore,
    ($flags) => $flags ?? ({} as FeatureFlagsState)
);

export function createFeatureFlagStore(flagName: FeatureFlagName) {
    return derived(
        featureFlagsStore,
        ($flags) => $flags?.[flagName] ?? false
    );
}

export function useFeatureFlag(flagName: FeatureFlagName) {
    const isEnabled = createFeatureFlagStore(flagName);

    return {
        isEnabled,
        isLoading: isLoadingFeatureFlags,
        error: featureFlagsError
    };
}
