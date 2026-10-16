import { getContext, setContext } from 'svelte';
import type { PasskeySummary } from '../auth/passkeys';
import type { ConnectedAccount } from '../types';

export type SettingsData = {
	email: string | undefined;
	notificationsDisabled: boolean;
	connectedAccounts: ConnectedAccount[];
	canUsePasskeys: boolean;
	passkeys: PasskeySummary[];
	uniCalColor: string;
	uniCalReminderMode: 'default' | 'off' | 'custom';
	uniCalReminderOffset: string;
};

export class PanelSettings {
	active = true;
	loaded = false;
	settings: SettingsData | undefined;

	// Changes loaded settings data. Does nothing before a full load, so a
	// change never makes partial data look complete.
	updateSettings(patch: Partial<SettingsData>): void {
		if (this.settings) {
			this.settings = { ...this.settings, ...patch };
		}
	}
}

const KEY = Symbol('panelSettings');

export function setPanelSettings(current: () => PanelSettings): void {
	setContext(KEY, current);
}

export function getPanelSettings(): PanelSettings {
	return getContext<() => PanelSettings>(KEY)();
}
