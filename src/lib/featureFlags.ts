import { API } from './api';
import { FEATURE_FLAGS } from './types';

type FeatureFlagName = (typeof FEATURE_FLAGS)[number];
type FeatureFlagsState = Record<FeatureFlagName, boolean>;

class FeatureFlagsService {
	private cache: FeatureFlagsState | null = null;
	private loadPromise: Promise<void> | null = null;
	// clearCache() moves this on. A load that started before then must not
	// write its flags, because they can belong to another environment.
	private epoch = 0;

	async loadFlags(force: boolean = false): Promise<void> {
		if (this.loadPromise && !force) {
			return this.loadPromise;
		}

		if (this.cache && !force) {
			return;
		}

		this.loadPromise = this._fetchFlags();
		return this.loadPromise;
	}

	private async _fetchFlags(): Promise<void> {
		const epoch = this.epoch;

		try {
			const response = await API.getAllFeatureFlags();
			if (epoch !== this.epoch) return;
			const flags: FeatureFlagsState = {} as FeatureFlagsState;

			// Map the response to our FeatureFlagsState type
			for (const flagName of FEATURE_FLAGS) {
				flags[flagName as FeatureFlagName] = response.feature_flags[flagName] ?? false;
			}

			this.cache = flags;
		} catch (error) {
			if (epoch !== this.epoch) return;
			console.error('Error loading feature flags:', error);

			// Set all flags to false on error
			const flags: FeatureFlagsState = {} as FeatureFlagsState;
			for (const flagName of FEATURE_FLAGS) {
				flags[flagName as FeatureFlagName] = false;
			}
			this.cache = flags;
		} finally {
			if (epoch === this.epoch) {
				this.loadPromise = null;
			}
		}
	}

	isEnabledSync(flagName: FeatureFlagName): boolean {
		return this.cache?.[flagName] ?? false;
	}

	clearCache(): void {
		this.epoch++;
		this.loadPromise = null;
		this.cache = null;
	}

	async reload(): Promise<void> {
		return this.loadFlags(true);
	}
}

export const featureFlags = new FeatureFlagsService();
