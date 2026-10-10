<script lang="ts">
	import { CLOSE_ICON, PASSKEY_ICON } from '$lib/icons';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { API } from '$lib/api';
	import { AuthError, clearLocalData } from '$lib/auth/session';
	import { EnvironmentManager, ENVIRONMENTS, type Environment } from '$lib/browser/environment';
	import { featureFlags } from '$lib/featureFlags';
	import {
		processedData as storedProcessedData,
		userSettings as storedUserSettings,
		icsUrl as storedIcsUrl
	} from '$lib/stores';
	import type { ConnectedAccount, UserSettings } from '$lib/types';
	import {
		listPasskeys,
		passkeysSupported,
		registerPasskey,
		removePasskey,
		type PasskeySummary
	} from '$lib/auth/passkeys';
	import { setUsageStatsEnabled, track, usageStatsEnabled } from '$lib/browser/telemetry';
	import { copyIcsUrl } from '$lib/browser/clipboard';
	import { openOAuthWindow } from '$lib/auth/popup';
	import { Button, SelectOutlined, snackbar, Switch } from 'm3-svelte';
	import { getPanelSession } from '$lib/panel/session';
	import { onMount } from 'svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import { resolveUniCalColor, UNI_CAL_DEFAULT_COLOR } from '$lib/calendar/colors';

	const UNI_CAL_REMINDER_DEFAULT_OFFSET = '15:hours';
	const UNI_CAL_REMINDER_CHOICES = [
		{ text: '15 minutes before', value: '15:minutes' },
		{ text: '30 minutes before', value: '30:minutes' },
		{ text: '1 hour before', value: '1:hours' },
		{ text: '3 hours before', value: '3:hours' },
		{ text: '6 hours before', value: '6:hours' },
		{ text: '15 hours before', value: '15:hours' },
		{ text: '1 day before', value: '1:days' },
		{ text: '2 days before', value: '2:days' },
		{ text: '1 week before', value: '7:days' }
	];

	let userSettings = $state<UserSettings | undefined>(undefined);
	// The calendar page mounts this component again after an environment change,
	// so this is always the session of the current environment.
	const session = getPanelSession();
	let email = $state<string | undefined>(undefined);
	let currentEnvironment = $state<Environment>('prod');
	let authenticatedEnvironments = $state<Environment[]>([]);
	let notificationsDisabled = $state(false);
	let connectedAccounts = $state<ConnectedAccount[]>([]);
	let showEnvSwitcher = $state<boolean>(false);
	let checkingEnvironment = $state<boolean>(false);
	let isRefreshingFlags = $state<boolean>(false);
	let passkeys = $state<PasskeySummary[]>([]);
	let canUsePasskeys = $state(false);
	let isAddingPasskey = $state(false);
	let newPasskeyName = $state('');
	let usageStats = $state(false);
	const UNI_CAL_COLOR_STORAGE_KEY = 'uniCalColor';
	const UNI_EVENTS_COLLAPSED_KEY = 'uniEventsCollapsed';
	let uniCalColor = $state<string>(
		browser
			? (localStorage.getItem(UNI_CAL_COLOR_STORAGE_KEY) ?? UNI_CAL_DEFAULT_COLOR)
			: UNI_CAL_DEFAULT_COLOR
	);
	let uniEventsCollapsed = $state(
		browser ? localStorage.getItem(UNI_EVENTS_COLLAPSED_KEY) === 'true' : false
	);
	let hasLoadedUniCalColor = $state(false);
	let uniCalReminderMode = $state<'default' | 'off' | 'custom'>('default');
	let uniCalReminderOffset = $state(UNI_CAL_REMINDER_DEFAULT_OFFSET);
	let isOtherCalendar = $state(
		browser ? localStorage.getItem('isOtherCalendar') === 'true' : false
	);

	$effect(() => {
		userSettings = $storedUserSettings;
	});

	let previousSettingsWasUndefined = false;
	$effect(() => {
		if (previousSettingsWasUndefined && $storedUserSettings !== undefined && browser) {
			(async () => {
				try {
					email = await API.getUserEmail().then((data) => data.email);
					currentEnvironment = await EnvironmentManager.getCurrentEnvironment();
					authenticatedEnvironments = await EnvironmentManager.getAuthenticatedEnvironments();
				} catch (error) {
					console.error('Failed to refetch email/env after environment switch:', error);
				}
			})();
		}
		previousSettingsWasUndefined = $storedUserSettings === undefined;
	});

	async function loadPasskeys() {
		passkeys = await listPasskeys();
		session.updateSettings({ passkeys: $state.snapshot(passkeys) });
	}

	async function addPasskey() {
		isAddingPasskey = true;
		try {
			const added = await registerPasskey(newPasskeyName.trim() || undefined);
			if (!added) {
				return;
			}
			track('passkey_created');
			newPasskeyName = '';
			await loadPasskeys();
			snackbar('Passkey added');
		} catch (e) {
			snackbar('Could not add the passkey: ' + e, undefined, true);
		} finally {
			isAddingPasskey = false;
		}
	}

	async function deletePasskey(passkeyId: string) {
		try {
			await removePasskey(passkeyId);
			await loadPasskeys();
			snackbar('Passkey removed');
		} catch (e) {
			snackbar('Could not remove the passkey: ' + e, undefined, true);
		}
	}

	onMount(async () => {
		await EnvironmentManager.migrateOldJwtToken();

		usageStats = await usageStatsEnabled();

		const cached = session.settings;
		if (cached) {
			// This page already loaded since the panel opened. Show that data
			// without new requests. The panel loads it again when it opens next.
			email = cached.email;
			notificationsDisabled = cached.notificationsDisabled;
			connectedAccounts = cached.connectedAccounts;
			canUsePasskeys = cached.canUsePasskeys;
			passkeys = cached.passkeys;
			uniCalColor = cached.uniCalColor;
			uniCalReminderMode = cached.uniCalReminderMode ?? 'default';
			uniCalReminderOffset = cached.uniCalReminderOffset ?? UNI_CAL_REMINDER_DEFAULT_OFFSET;
			hasLoadedUniCalColor = true;
			// Feature flags keep their own in-memory cache, so this sends no request.
			await featureFlags.loadFlags();
			showEnvSwitcher = featureFlags.isEnabledSync('envSwitcher');
		} else {
			await loadSettingsData();
		}

		currentEnvironment = await EnvironmentManager.getCurrentEnvironment();
		authenticatedEnvironments = await EnvironmentManager.getAuthenticatedEnvironments();
	});

	async function loadSettingsData() {
		// Only a load where the main requests succeed goes into the cache.
		// After a failure, the next visit to this page tries again.
		let complete = true;

		// None of these requests depend on each other, so send them together
		// instead of one after another. Each one handles its own failure.
		await Promise.all([
			// Feature flags load on their own so flag-gated UI shows even if other API calls fail
			featureFlags.loadFlags().then(() => {
				showEnvSwitcher = featureFlags.isEnabledSync('envSwitcher');
			}),

			(async () => {
				if (await passkeysSupported()) {
					try {
						await loadPasskeys();
						canUsePasskeys = true;
					} catch {
						canUsePasskeys = false;
						complete = false;
					}
				}
			})(),

			(async () => {
				try {
					const [userSettingsData, emailData] = await Promise.all([
						API.userSettings(),
						API.getUserEmail()
					]);

					userSettings = userSettingsData;
					// A reply for an ended session must not write into the new one.
					if (session.active) {
						storedUserSettings.set(userSettings);
					}
					email = emailData.email;
				} catch (error) {
					console.error('Failed to load settings:', error);
					complete = false;
				}
			})(),

			// Fetch notification DND status
			(async () => {
				try {
					const status = await API.getNotificationStatus();
					notificationsDisabled = status.notifications_disabled;
				} catch (e) {
					// DND status might not be available, that's okay
				}
			})(),

			// Fetch connected accounts
			(async () => {
				try {
					const accounts = await API.getConnectedAccounts();
					connectedAccounts = accounts.oauth_credentials || [];
				} catch (e) {
					console.error('Failed to fetch connected accounts:', e);
					complete = false;
				}
			})(),

			// Fetch uni cal color preference
			(async () => {
				try {
					const calPrefs = await API.getCalendarPreferences();
					uniCalColor = resolveUniCalColor(calPrefs);
					if (browser) {
						localStorage.setItem(UNI_CAL_COLOR_STORAGE_KEY, uniCalColor);
					}
					const storedReminders = calPrefs.uni_cal_global?.reminder_settings;
					if (storedReminders == null) {
						uniCalReminderMode = 'default';
						uniCalReminderOffset = UNI_CAL_REMINDER_DEFAULT_OFFSET;
					} else if (storedReminders.length === 0) {
						uniCalReminderMode = 'off';
						uniCalReminderOffset = UNI_CAL_REMINDER_DEFAULT_OFFSET;
					} else {
						const first = storedReminders[0];
						const offset = `${first.time}:${first.type}`;
						uniCalReminderMode = 'custom';
						uniCalReminderOffset = UNI_CAL_REMINDER_CHOICES.some(
							(choice) => choice.value === offset
						)
							? offset
							: UNI_CAL_REMINDER_DEFAULT_OFFSET;
					}
				} catch (e) {
					// Calendar preferences might not exist yet, that's okay
				} finally {
					hasLoadedUniCalColor = true;
				}
			})()
		]);

		if (complete) {
			session.settings = {
				email,
				notificationsDisabled,
				connectedAccounts: $state.snapshot(connectedAccounts),
				canUsePasskeys,
				passkeys: $state.snapshot(passkeys),
				uniCalColor,
				uniCalReminderMode,
				uniCalReminderOffset
			};
		}
	}

	let defaultColorLecture = $derived(userSettings?.default_color_lecture ?? '');
	let defaultColorLab = $derived(userSettings?.default_color_lab ?? '');
	let militaryTimeValue = $derived(userSettings?.military_time ? 'true' : 'false');
	let advancedEditingValue = $derived(userSettings?.advanced_editing ?? false);
	let syncUniversityEventsValue = $derived(userSettings?.sync_university_events ?? false);
	let universityEventCategories = $derived(userSettings?.university_event_categories ?? []);
	let availableCategories = $derived(userSettings?.available_university_event_categories ?? []);
	let showHistoricTermsValue = $derived(userSettings?.show_historic_terms ?? false);

	// Saves the settings in the background. The user already sees the new
	// value, so a failure only needs a message, not a reload.
	function saveUserSettings(settings: UserSettings) {
		API.userSettings(settings).catch((error) => {
			// The auth code already told the user that the session ended.
			if (error instanceof AuthError) return;
			console.error('Failed to save the user settings:', error);
			snackbar('Failed to save the setting', undefined, true);
		});
	}

	function updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): boolean {
		if (!userSettings) return false;
		userSettings = { ...userSettings, [key]: value };
		storedUserSettings.set(userSettings);
		saveUserSettings(userSettings);
		return true;
	}

	function updateDefaultColor(key: 'default_color_lecture' | 'default_color_lab', value: string) {
		if (updateSetting(key, value)) clearStoredColors();
	}

	async function handleUniCalColorChange(newColor: string) {
		if (!hasLoadedUniCalColor) return;
		if (!newColor) return;
		uniCalColor = newColor;

		try {
			await API.setAllUniCalCategoriesColor(newColor);
			if (browser) {
				localStorage.setItem(UNI_CAL_COLOR_STORAGE_KEY, newColor);
			}
			session.updateSettings({ uniCalColor: newColor });
			snackbar('University events color updated', undefined, true);
		} catch (error) {
			console.error('Failed to update university events color:', error);
			snackbar('Failed to update color. Please try again.', undefined, true);
		}
	}

	async function saveUniCalReminder() {
		if (!hasLoadedUniCalColor) return;

		let reminder_settings: { time: string; type: string; method: string }[] | 'default';
		if (uniCalReminderMode === 'default') {
			reminder_settings = 'default';
		} else if (uniCalReminderMode === 'off') {
			reminder_settings = [];
		} else {
			const [time, type] = uniCalReminderOffset.split(':');
			reminder_settings = [{ time: time || '15', type: type || 'hours', method: 'notification' }];
		}

		try {
			await API.setUniCalGlobalPreference({ reminder_settings });
			session.updateSettings({
				uniCalReminderMode,
				uniCalReminderOffset
			});
			snackbar('University event reminders updated', undefined, true);
		} catch (error) {
			console.error('Failed to update university event reminders:', error);
			snackbar('Failed to update reminders. Please try again.', undefined, true);
		}
	}

	function setUniCalReminderMode(value: string) {
		if (value !== 'default' && value !== 'off' && value !== 'custom') return;
		if (value === uniCalReminderMode) return;
		uniCalReminderMode = value;
		saveUniCalReminder();
	}

	function setUniCalReminderOffset(value: string) {
		if (value === uniCalReminderOffset) return;
		uniCalReminderOffset = value;
		if (uniCalReminderMode === 'custom') {
			saveUniCalReminder();
		}
	}

	function toggleUniEventsCollapsed() {
		uniEventsCollapsed = !uniEventsCollapsed;
		if (browser) {
			localStorage.setItem(UNI_EVENTS_COLLAPSED_KEY, String(uniEventsCollapsed));
		}
	}

	function toggleUniversityCategory(categoryId: string) {
		if (!userSettings) return;
		const currentCategories = userSettings.university_event_categories ?? [];
		let newCategories: string[];

		if (currentCategories.includes(categoryId)) {
			newCategories = currentCategories.filter((c) => c !== categoryId);
		} else {
			newCategories = [...currentCategories, categoryId];
		}

		updateSetting('university_event_categories', newCategories);
	}

	function isCategorySelected(categoryId: string): boolean {
		return universityEventCategories.includes(categoryId);
	}

	function clearStoredColors() {
		storedProcessedData.update((list) => {
			return list.map((termData) => ({
				...termData,
				responseData: {
					...termData.responseData,
					classes: termData.responseData.classes.map((course) => ({
						...course,
						meeting_times: course.meeting_times.map((meeting) => {
							const { color, ...meetingWithoutColor } = meeting;
							return meetingWithoutColor;
						})
					}))
				}
			}));
		});
	}

	async function switchEnvironment(newEnv: Environment) {
		if (newEnv === currentEnvironment || checkingEnvironment) return;

		const previousEnvironment = currentEnvironment;
		currentEnvironment = newEnv;

		// Do not switch to an environment whose backend is down. The user
		// would land on a sign-in page that cannot reach the server.
		checkingEnvironment = true;
		const reachable = await EnvironmentManager.isReachable(newEnv);
		checkingEnvironment = false;
		if (!reachable) {
			currentEnvironment = previousEnvironment;
			snackbar(
				`${ENVIRONMENTS[newEnv].displayName} is offline. Staying on ${ENVIRONMENTS[previousEnvironment].displayName}.`,
				undefined,
				true
			);
			return;
		}

		// Set these before the switch. The (panel) layout mounts the calendar
		// page again as soon as the environment changes, and the page reads them.
		if (browser) {
			sessionStorage.setItem('returnToSettings', 'true');
			sessionStorage.setItem('clearCalendarData', 'true');
		}

		const hasJwt = await EnvironmentManager.switchEnvironment(newEnv);

		const envDisplayName = ENVIRONMENTS[newEnv].displayName;

		if (!hasJwt) {
			storedProcessedData.set([]);
			snackbar(`Switched to ${envDisplayName}. Please sign in.`, undefined, true);
			await goto(resolve('/'));
		}
	}

	async function toggleNotifications(disabled: boolean) {
		notificationsDisabled = disabled;
		try {
			if (disabled) {
				await API.disableNotifications();
				snackbar('All notifications disabled', undefined, true);
			} else {
				await API.enableNotifications();
				snackbar('Notifications re-enabled', undefined, true);
			}
			session.updateSettings({ notificationsDisabled: disabled });
		} catch (e) {
			console.error('Failed to update notification settings:', e);
			snackbar('Failed to update notification settings', undefined, true);
			notificationsDisabled = !disabled;
		}
	}

	// Firefox shows its own consent prompt, which can refuse. Show what the
	// browser settled on, not what the switch asked for.
	function setUsageStats(value: boolean) {
		usageStats = value;
		setUsageStatsEnabled(value)
			.then((enabled) => {
				usageStats = enabled;
			})
			.catch(() => {
				usageStats = !value;
			});
	}

	async function refreshConnectedAccounts(): Promise<boolean> {
		try {
			const accounts = await API.getConnectedAccounts();
			connectedAccounts = accounts.oauth_credentials || [];
			session.updateSettings({ connectedAccounts: $state.snapshot(connectedAccounts) });
			return true;
		} catch (e) {
			console.error('Failed to refresh accounts:', e);
			return false;
		}
	}

	function whenOAuthSucceeds(onSuccess: () => void) {
		const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
			if (changes.oauth_status?.newValue !== 'success') return;
			chrome.storage.onChanged.removeListener(onChanged);
			onSuccess();
		};
		chrome.storage.onChanged.addListener(onChanged);
	}

	async function addGoogleAccount() {
		try {
			const response = await API.requestOAuthForEmail();
			if (response.error) {
				snackbar(response.error, undefined, true);
				return;
			}

			if (response.oauth_url) {
				const accountCountBefore = connectedAccounts.length;
				await chrome.storage.local.remove('oauth_status');
				whenOAuthSucceeds(async () => {
					if (await refreshConnectedAccounts()) {
						if (connectedAccounts.length > accountCountBefore) {
							track('google_calendar_connected');
						}
						snackbar('Account connected successfully!', undefined, true);
					}
				});
				await openOAuthWindow(response.oauth_url);
			} else if (response.calendar_id) {
				snackbar('This email is already connected', undefined, true);
			}
		} catch (e) {
			console.error('Failed to add Google account:', e);
			snackbar('Failed to add Google account', undefined, true);
		}
	}

	async function disconnectAccount(credentialId: string) {
		try {
			await API.disconnectAccount(credentialId);
			connectedAccounts = connectedAccounts.filter((a) => a.id !== credentialId);
			session.updateSettings({ connectedAccounts: $state.snapshot(connectedAccounts) });
			snackbar('Account disconnected', undefined, true);
		} catch (e) {
			console.error('Failed to disconnect account:', e);
			snackbar('Failed to disconnect account', undefined, true);
		}
	}

	async function reauthAccount(email: string) {
		try {
			const response = await API.requestOAuthForEmail(email);
			if (response.error) {
				snackbar(response.error, undefined, true);
				return;
			}

			if (response.oauth_url) {
				await chrome.storage.local.remove('oauth_status');
				whenOAuthSucceeds(async () => {
					if (await refreshConnectedAccounts()) {
						snackbar('Account re-authenticated successfully!', undefined, true);
					}
				});
				await openOAuthWindow(response.oauth_url);
			}
		} catch (e) {
			console.error('Failed to re-authenticate account:', e);
			snackbar('Failed to re-authenticate account', undefined, true);
		}
	}

	async function manualRefreshFeatureFlags() {
		isRefreshingFlags = true;
		try {
			featureFlags.clearCache();
			await featureFlags.reload();
			showEnvSwitcher = featureFlags.isEnabledSync('envSwitcher');
			snackbar('Feature flags refreshed!', undefined, true);
		} finally {
			isRefreshingFlags = false;
		}
	}
</script>

<div class="min-h-0 gap-3 pb-2 @container flex w-full flex-1 flex-col overflow-y-auto">
	{#if showEnvSwitcher}
		<section
			class="gap-4 rounded-2xl bg-surface-container p-4 flex flex-row items-center justify-between shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)] @max-[30rem]:flex-col @max-[30rem]:items-stretch"
		>
			<div class="min-w-0 gap-1 flex flex-col">
				<p class="m-0 text-xs font-bold tracking-wide text-primary uppercase">Developer</p>
				<h2 class="m-0 text-base font-bold text-on-surface">Environment</h2>
				<p class="m-0 text-sm text-on-surface-variant">
					{#each Object.values(ENVIRONMENTS) as env (env.name)}
						{#if authenticatedEnvironments.includes(env.name)}
							<span class="text-primary">✓ {env.displayName}</span>
						{:else}
							<span class="text-outline-variant">○ {env.displayName}</span>
						{/if}
						{#if env.name !== 'prod'}&nbsp;&nbsp;{/if}
					{/each}
				</p>
			</div>
			<div class="gap-2 flex shrink-0 items-center">
				<SelectOutlined
					label=""
					options={[
						{ text: ENVIRONMENTS.prod.displayName, value: 'prod' },
						{ text: ENVIRONMENTS.staging.displayName, value: 'staging' },
						{ text: ENVIRONMENTS.dev.displayName, value: 'dev' }
					]}
					disabled={checkingEnvironment}
					bind:value={() => currentEnvironment, (value) => switchEnvironment(value as Environment)}
				/>
			</div>
		</section>
	{/if}

	<section
		class="rounded-2xl bg-surface-container-low overflow-hidden shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.1)]"
	>
		<div class="divide-outline-variant bg-surface-container divide-y">
			{#if !isOtherCalendar}
				<div
					class="gap-4 p-4 flex flex-row items-center justify-between @max-[30rem]:flex-col @max-[30rem]:items-stretch"
				>
					<div class="min-w-0 gap-1 flex flex-col">
						<h3 class="m-0 text-sm font-bold text-on-surface">Calendar link</h3>
						<p class="m-0 text-sm text-on-surface-variant">
							Copy your calendar feed URL to subscribe in other apps.
						</p>
					</div>
					<Button variant="outlined" square onclick={() => copyIcsUrl($storedIcsUrl)}
						>Copy Calendar Link</Button
					>
				</div>
			{/if}
			<div
				class="gap-4 p-4 flex flex-row items-center justify-between @max-[24rem]:flex-col @max-[24rem]:items-stretch"
			>
				<h3 class="m-0 text-sm font-bold text-on-surface">Default lecture color</h3>
				<div class="gap-2 flex flex-row items-center">
					<ColorPicker
						value={defaultColorLecture}
						label="Default lecture color"
						onchange={(newColor) => updateDefaultColor('default_color_lecture', newColor)}
					/>
				</div>
			</div>
			<div
				class="gap-4 p-4 flex flex-row items-center justify-between @max-[24rem]:flex-col @max-[24rem]:items-stretch"
			>
				<h3 class="m-0 text-sm font-bold text-on-surface">Default lab color</h3>
				<div class="gap-2 flex flex-row items-center">
					<ColorPicker
						value={defaultColorLab}
						label="Default lab color"
						onchange={(newColor) => updateDefaultColor('default_color_lab', newColor)}
					/>
				</div>
			</div>
			<div class="gap-4 p-4 flex flex-row items-center justify-between">
				<h3 class="m-0 text-sm font-bold text-on-surface">Time format</h3>
				<div class="gap-2 flex flex-row items-center">
					<SelectOutlined
						label=""
						options={[
							{ text: '12-hour', value: 'false' },
							{ text: '24-hour', value: 'true' }
						]}
						bind:value={
							() => militaryTimeValue, (value) => updateSetting('military_time', value === 'true')
						}
					/>
				</div>
			</div>
			<div class="gap-4 p-4 flex flex-row items-center justify-between">
				<div class="min-w-0 gap-1 flex flex-col">
					<h3 class="m-0 text-sm font-bold text-on-surface">Advanced editing</h3>
					<p class="m-0 text-sm text-on-surface-variant">
						Use custom templates when editing calendar events.
					</p>
				</div>
				<div class="gap-2 flex shrink-0 items-center">
					<label>
						<Switch
							bind:checked={
								() => advancedEditingValue, (value) => updateSetting('advanced_editing', value)
							}
						/>
					</label>
				</div>
			</div>
			<div class="gap-4 p-4 flex flex-row items-center justify-between">
				<div class="min-w-0 gap-1 flex flex-col">
					<h3 class="m-0 text-sm font-bold text-on-surface">Show historic terms</h3>
					<p class="m-0 text-sm text-on-surface-variant">
						Show past terms alongside your current schedule.
					</p>
				</div>
				<div class="gap-2 flex shrink-0 items-center">
					<label>
						<Switch
							bind:checked={
								() => showHistoricTermsValue, (value) => updateSetting('show_historic_terms', value)
							}
						/>
					</label>
				</div>
			</div>
			<div class="gap-4 p-4 flex flex-row items-center justify-between">
				<div class="min-w-0 gap-1 flex flex-col">
					<h3 class="m-0 text-sm font-bold text-on-surface">Disable all notifications</h3>
					<p class="m-0 text-sm text-on-surface-variant">Turn off all calendar event reminders.</p>
				</div>
				<div class="gap-2 flex shrink-0 items-center">
					<label>
						<Switch bind:checked={() => notificationsDisabled, toggleNotifications} />
					</label>
				</div>
			</div>
			<div class="gap-4 p-4 flex flex-row items-center justify-between">
				<div class="min-w-0 gap-1 flex flex-col">
					<h3 class="m-0 text-sm font-bold text-on-surface">Share anonymous usage counts</h3>
					<p class="m-0 text-sm text-on-surface-variant">
						Counts such as how many schedule imports succeed. No names, emails, or schedules.
					</p>
				</div>
				<div class="gap-2 flex shrink-0 items-center">
					<label>
						<Switch bind:checked={() => usageStats, setUsageStats} />
					</label>
				</div>
			</div>
		</div>
	</section>

	<section
		class="rounded-2xl bg-surface-container overflow-hidden shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]"
	>
		<!-- Connected Google Accounts Section -->
		<div class="gap-3 p-4 flex flex-col">
			<div class="gap-1 flex flex-col">
				<h2 class="m-0 text-base font-bold text-on-surface">Connected Google accounts</h2>
				<p class="m-0 text-sm text-on-surface-variant">
					Add multiple Google accounts to sync your calendar.
				</p>
			</div>

			{#if connectedAccounts.length > 0}
				<div class="gap-2 flex flex-col">
					{#each connectedAccounts as account (account.id)}
						<div
							class={[
								'gap-3 rounded-xl bg-surface-container-lowest p-3 flex flex-row items-center justify-between @max-[30rem]:flex-col @max-[30rem]:items-stretch',
								account.needs_reauth && 'outline-error outline outline-1'
							]}
						>
							<div class="min-w-0 gap-1 flex flex-col">
								<div class="gap-2 flex flex-row items-center">
									<svg
										class="w-5 h-5 {account.needs_reauth ? 'text-error' : 'text-primary'}"
										viewBox="0 0 24 24"
										fill="currentColor"
									>
										<path
											d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
										/>
									</svg>
									<span class="text-sm text-on-surface truncate">{account.email}</span>
								</div>
								{#if account.needs_reauth}
									<span class="ml-7 text-xs text-error">
										{account.token_revoked
											? 'Access revoked — please re-authenticate.'
											: 'Authentication expired — please re-authenticate.'}
									</span>
								{/if}
							</div>
							<div class="gap-2 flex shrink-0 flex-row items-center">
								{#if account.needs_reauth}
									<Button variant="tonal" onclick={() => reauthAccount(account.email)}>
										Re-auth
									</Button>
								{/if}
								{#if connectedAccounts.length > 1}
									<Button variant="text" onclick={() => disconnectAccount(account.id)}>
										<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
											<path d={CLOSE_ICON} />
										</svg>
									</Button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="m-0 rounded-xl bg-surface-container-lowest p-3 text-sm text-on-surface-variant">
					No Google accounts connected.
				</p>
			{/if}

			<div
				class="gap-2 flex flex-row items-center @max-[24rem]:flex-col @max-[24rem]:items-stretch"
			>
				<Button variant="tonal" onclick={addGoogleAccount}>Add Account</Button>
			</div>
		</div>

		<!-- Passkeys Section -->
		{#if canUsePasskeys}
			<div class="gap-3 border-outline-variant p-4 flex flex-col border-t">
				<div class="gap-1 flex flex-col">
					<h2 class="m-0 text-base font-bold text-on-surface">Passkeys</h2>
					<p class="m-0 text-sm text-on-surface-variant">
						Sign in on a new device without going through Google again.
					</p>
				</div>

				{#if passkeys.length > 0}
					<div class="gap-2 flex flex-col">
						{#each passkeys as passkey (passkey.id)}
							<div
								class="gap-3 rounded-xl bg-surface-container-lowest p-3 flex flex-row items-center justify-between"
							>
								<div class="min-w-0 gap-1 flex flex-col">
									<div class="gap-2 flex flex-row items-center">
										<svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
											<path d={PASSKEY_ICON} />
										</svg>
										<span class="text-sm text-on-surface truncate">{passkey.nickname}</span>
									</div>
									<span class="ml-7 text-xs text-on-surface-variant">
										{passkey.last_used_at
											? `Last used ${new Date(passkey.last_used_at).toLocaleDateString()}`
											: 'Never used'}
									</span>
								</div>
								<Button variant="text" onclick={() => deletePasskey(passkey.id)}>
									<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
										<path d={CLOSE_ICON} />
									</svg>
								</Button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="m-0 rounded-xl bg-surface-container-lowest p-3 text-sm text-on-surface-variant">
						No passkeys yet.
					</p>
				{/if}

				<div
					class="gap-2 flex flex-row items-center @max-[24rem]:flex-col @max-[24rem]:items-stretch"
				>
					<input
						type="text"
						placeholder="Name this device (optional)"
						bind:value={newPasskeyName}
						aria-label="Passkey device name"
						class="min-w-0 rounded-xl border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:border-primary flex-1 border outline-none"
						onkeydown={(e) => e.key === 'Enter' && addPasskey()}
					/>
					<Button variant="tonal" onclick={addPasskey} disabled={isAddingPasskey}>
						{isAddingPasskey ? 'Waiting…' : 'Add Passkey'}
					</Button>
				</div>
			</div>
		{/if}
	</section>

	<!-- University Calendar Events Section -->
	<section
		class="gap-3 rounded-2xl bg-surface-container p-4 flex flex-col shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]"
	>
		<div class="gap-4 flex flex-row items-center justify-between">
			<div class="min-w-0 gap-1 flex flex-col">
				<h2 class="m-0 text-base font-bold text-on-surface">Sync university events</h2>
				<p class="m-0 text-sm text-on-surface-variant">
					Add campus events to your calendar. Holidays are always synced.
				</p>
			</div>
			<div class="gap-2 flex shrink-0 items-center">
				{#if syncUniversityEventsValue && availableCategories.length > 0}
					<button
						type="button"
						class="h-8 w-8 text-on-surface-variant hover:bg-surface-container-high flex items-center justify-center rounded-full transition-colors"
						aria-expanded={!uniEventsCollapsed}
						aria-controls="uni-events-details"
						aria-label={uniEventsCollapsed
							? 'Expand university event options'
							: 'Collapse university event options'}
						onclick={toggleUniEventsCollapsed}
					>
						<svg
							class={['h-5 w-5 transition-transform', !uniEventsCollapsed && 'rotate-180']}
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
						</svg>
					</button>
				{/if}
				<label>
					<Switch
						bind:checked={
							() => syncUniversityEventsValue,
							(value) => updateSetting('sync_university_events', value)
						}
					/>
				</label>
			</div>
		</div>

		{#if syncUniversityEventsValue && availableCategories.length > 0}
			<div id="uni-events-details" class={['gap-3 flex flex-col', uniEventsCollapsed && 'hidden']}>
				<div
					class="gap-3 rounded-xl bg-surface-container-lowest p-3 flex flex-row items-center justify-between @max-[24rem]:flex-col @max-[24rem]:items-stretch"
				>
					<h3 class="m-0 text-sm font-bold text-on-surface">University events color</h3>
					<div class="gap-2 flex flex-row items-center">
						<ColorPicker
							value={uniCalColor}
							label="University events color"
							onchange={(newColor) => handleUniCalColorChange(newColor)}
						/>
					</div>
				</div>

				<div
					class="gap-3 rounded-xl bg-surface-container-lowest p-3 flex flex-row items-center justify-between @max-[24rem]:flex-col @max-[24rem]:items-stretch"
				>
					<div class="min-w-0 gap-1 flex flex-col">
						<h3 class="m-0 text-sm font-bold text-on-surface">University event reminders</h3>
						<p class="m-0 text-xs text-on-surface-variant">
							Holidays, deadlines, and other campus events. Class reminders stay as they are.
						</p>
					</div>
					<div class="gap-2 flex flex-row flex-wrap items-center justify-end">
						<SelectOutlined
							label=""
							options={[
								{ text: 'Default', value: 'default' },
								{ text: 'Off', value: 'off' },
								{ text: 'Custom', value: 'custom' }
							]}
							bind:value={() => uniCalReminderMode, setUniCalReminderMode}
						/>
						{#if uniCalReminderMode === 'custom'}
							<SelectOutlined
								label=""
								options={UNI_CAL_REMINDER_CHOICES}
								bind:value={() => uniCalReminderOffset, setUniCalReminderOffset}
							/>
						{/if}
					</div>
				</div>

				<div class="gap-1 flex flex-col">
					<p class="m-0 mb-1 text-sm font-medium text-on-surface-variant">Event types to sync</p>
					{#each availableCategories.filter((c) => c.id !== 'holiday') as category (category.id)}
						<label
							class="gap-3 rounded-xl p-3 hover:bg-surface-container-high flex cursor-pointer flex-row items-start transition-colors"
						>
							<input
								type="checkbox"
								checked={isCategorySelected(category.id)}
								onchange={() => toggleUniversityCategory(category.id)}
								class="mt-1 w-4 h-4 accent-primary"
							/>
							<div class="flex flex-col">
								<span class="text-sm font-medium text-on-surface">{category.name}</span>
								<span class="text-xs text-on-surface-variant">{category.description}</span>
							</div>
						</label>
					{/each}
				</div>
			</div>
		{/if}
	</section>

	<section
		class="gap-4 rounded-2xl bg-surface-container p-4 flex flex-row items-center justify-between @max-[30rem]:flex-col @max-[30rem]:items-stretch"
	>
		<div class="min-w-0 gap-1 flex flex-col">
			<h2 class="m-0 text-base font-bold text-on-surface">Dev Tools</h2>
			<p class="m-0 text-sm text-on-surface-variant">
				Reload remote feature availability or reset local data
			</p>
		</div>
		<div
			class="gap-2 flex shrink-0 flex-row items-center @max-[24rem]:flex-col @max-[24rem]:items-stretch"
		>
			<Button variant="tonal" onclick={manualRefreshFeatureFlags} disabled={isRefreshingFlags}>
				{isRefreshingFlags ? 'Refreshing...' : 'Refresh Flags'}
			</Button>
			<Button variant="filled" onclick={clearLocalData}>Clear Local Data</Button>
		</div>
	</section>
	<p
		class="m-0 rounded-xl bg-error-container px-4 py-3 text-sm text-on-error-container text-center"
	>
		<span class="font-semibold">Warning:</span>
		Clearing local data signs you out, but does not affect your calendar data.
	</p>
	<p class="m-0 px-2 pb-1 text-xs text-on-surface-variant text-center break-all">
		{email ? `Signed in as ${email}` : 'Loading your account…'}
	</p>
</div>
