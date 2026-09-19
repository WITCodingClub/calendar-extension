<script lang="ts">
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { API } from "$lib/api";
    import { AuthError, clearLocalData } from "$lib/auth";
    import { EnvironmentManager, ENVIRONMENTS, type Environment } from "$lib/environment";
    import { featureFlags } from "$lib/featureFlags";
    import { processedData as storedProcessedData, userSettings as storedUserSettings, icsUrl as storedIcsUrl } from "$lib/store";
    import type { UserSettings } from "$lib/types";
    import { listPasskeys, passkeysSupported, registerPasskey, removePasskey, type PasskeySummary } from "$lib/passkeys";
    import { setUsageStatsEnabled, track, usageStatsEnabled } from "$lib/telemetry";
    import { Button, SelectOutlined, snackbar, Switch } from "m3-svelte";
    import { getPanelSession, type ConnectedAccount } from "$lib/panelSession";
    import { onMount } from "svelte";
    import ColorPicker from "./ColorPicker.svelte";
    import { resolveUniCalColor, UNI_CAL_DEFAULT_COLOR } from "$lib/uniCalColor";

    let userSettings = $state<UserSettings | undefined>(undefined);
    // The calendar page mounts this component again after an environment change,
    // so this is always the session of the current environment.
    const session = getPanelSession();
    let email = $state<string | undefined>(undefined);
    let currentEnvironment = $state<Environment>('prod');
    let authenticatedEnvironments = $state<Environment[]>([]);
    let notificationsDisabled = $state(false);
    let connectedAccounts = $state<ConnectedAccount[]>([]);
    let addEmailInput = $state("");
    let showEnvSwitcher = $state<boolean>(false);
    let isRefreshingFlags = $state<boolean>(false);
    let passkeys = $state<PasskeySummary[]>([]);
    let canUsePasskeys = $state(false);
    let isAddingPasskey = $state(false);
    let newPasskeyName = $state("");
    let usageStats = $state(false);
    const UNI_CAL_COLOR_STORAGE_KEY = "uniCalColor";
    const UNI_EVENTS_COLLAPSED_KEY = "uniEventsCollapsed";
    let uniCalColor = $state<string>(
        browser ? (localStorage.getItem(UNI_CAL_COLOR_STORAGE_KEY) ?? UNI_CAL_DEFAULT_COLOR) : UNI_CAL_DEFAULT_COLOR
    );
    let uniEventsCollapsed = $state(browser ? localStorage.getItem(UNI_EVENTS_COLLAPSED_KEY) === "true" : false);
    let hasLoadedUniCalColor = $state(false);
    let isOtherCalendar = $state(browser ? localStorage.getItem('isOtherCalendar') === 'true' : false);

    $effect(() => {
        userSettings = $storedUserSettings;
    });

    let previousSettingsWasUndefined = false;
    $effect(() => {
        if (previousSettingsWasUndefined && $storedUserSettings !== undefined && browser) {
            (async () => {
                try {
                    email = await API.getUserEmail().then(data => data.email);
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
            newPasskeyName = "";
            await loadPasskeys();
            snackbar("Passkey added");
        } catch (e) {
            snackbar("Could not add the passkey: " + e, undefined, true);
        } finally {
            isAddingPasskey = false;
        }
    }

    async function deletePasskey(passkeyId: string) {
        try {
            await removePasskey(passkeyId);
            await loadPasskeys();
            snackbar("Passkey removed");
        } catch (e) {
            snackbar("Could not remove the passkey: " + e, undefined, true);
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
            };
        }
    }

    let defaultColorLecture = $derived(userSettings?.default_color_lecture ?? "");
    let defaultColorLab = $derived(userSettings?.default_color_lab ?? "");
    let militaryTimeValue = $derived(userSettings?.military_time ? "true" : "false");
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

    const defaultColorLectureGetterSetter = {
        get value() { return defaultColorLecture; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, default_color_lecture: value };
			storedUserSettings.set(userSettings);
			saveUserSettings(userSettings);
			clearStoredColors();
		}
    }

    const militaryTimeGetterSetter = {
        get value() { return militaryTimeValue; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, military_time: value === "true" };
			storedUserSettings.set(userSettings);
			saveUserSettings(userSettings);
		}
    }

    const defaultColorLabGetterSetter = {
        get value() { return defaultColorLab; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, default_color_lab: value };
			storedUserSettings.set(userSettings);
			saveUserSettings(userSettings);
			clearStoredColors();
		}
    }

    const advancedEditingGetterSetter = {
        get value() { return advancedEditingValue; },
		set value(value: boolean) {
			if (!userSettings) return;
			userSettings = { ...userSettings, advanced_editing: value };
			storedUserSettings.set(userSettings);
			saveUserSettings(userSettings);
		}
    }

    const syncUniversityEventsGetterSetter = {
        get value() { return syncUniversityEventsValue; },
		set value(value: boolean) {
			if (!userSettings) return;
			userSettings = { ...userSettings, sync_university_events: value };
			storedUserSettings.set(userSettings);
			saveUserSettings(userSettings);
		}
    }

    const showHistoricTermsGetterSetter = {
        get value() { return showHistoricTermsValue; },
        set value(value: boolean) {
            if (!userSettings) return;
            userSettings = { ...userSettings, show_historic_terms: value };
            storedUserSettings.set(userSettings);
            saveUserSettings(userSettings);
        }
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
            newCategories = currentCategories.filter(c => c !== categoryId);
        } else {
            newCategories = [...currentCategories, categoryId];
        }

        userSettings = { ...userSettings, university_event_categories: newCategories };
        storedUserSettings.set(userSettings);
        saveUserSettings(userSettings);
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
        if (newEnv === currentEnvironment) return;

        currentEnvironment = newEnv;

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

    const environmentGetterSetter = {
        get value() { return currentEnvironment; },
        set value(value: string) {
            switchEnvironment(value as Environment);
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

    const notificationsDisabledGetterSetter = {
        get value() { return notificationsDisabled; },
        set value(value: boolean) {
            toggleNotifications(value);
        }
    }

    // Firefox shows its own consent prompt, which can refuse. Show what the
    // browser settled on, not what the switch asked for.
    const usageStatsGetterSetter = {
        get value() { return usageStats; },
        set value(value: boolean) {
            usageStats = value;
            setUsageStatsEnabled(value)
                .then((enabled) => { usageStats = enabled; })
                .catch(() => { usageStats = !value; });
        }
    }

    async function openOAuthWindow(oauthUrl: string) {
        const screenWidth = window.screen.availWidth;
        const screenHeight = window.screen.availHeight;
        const createOptions: chrome.windows.CreateData = {
            url: oauthUrl,
            width: 650,
            height: 800,
            left: Math.floor((screenWidth - 650) / 2),
            top: Math.floor((screenHeight - 800) / 2),
            type: 'popup'
        };

        try {
            await chrome.windows.create(createOptions);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('Invalid value for bounds')) {
                throw error;
            }
            await chrome.windows.create({
                url: oauthUrl,
                width: Math.min(650, screenWidth),
                height: Math.min(800, screenHeight),
                type: 'popup'
            });
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
        if (!addEmailInput.trim()) {
            snackbar('Please enter an email address', undefined, true);
            return;
        }

        try {
            const response = await API.requestOAuthForEmail(addEmailInput.trim());
            if (response.error) {
                snackbar(response.error, undefined, true);
                return;
            }

            if (response.oauth_url) {
                const accountCountBefore = connectedAccounts.length;
                await chrome.storage.local.remove('oauth_status');
                whenOAuthSucceeds(async () => {
                    try {
                        const accounts = await API.getConnectedAccounts();
                        connectedAccounts = accounts.oauth_credentials || [];
                        if (connectedAccounts.length > accountCountBefore) {
                            track('google_calendar_connected');
                        }
                        session.updateSettings({ connectedAccounts: $state.snapshot(connectedAccounts) });
                        snackbar('Account connected successfully!', undefined, true);
                    } catch (e) {
                        console.error('Failed to refresh accounts:', e);
                    }
                    addEmailInput = "";
                });
                await openOAuthWindow(response.oauth_url);
            } else if (response.calendar_id) {
                snackbar('This email is already connected', undefined, true);
                addEmailInput = "";
            }
        } catch (e) {
            console.error('Failed to add Google account:', e);
            snackbar('Failed to add Google account', undefined, true);
        }
    }

    async function disconnectAccount(credentialId: string) {
        try {
            await API.disconnectAccount(credentialId);
            connectedAccounts = connectedAccounts.filter(a => a.id !== credentialId);
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
                    try {
                        const accounts = await API.getConnectedAccounts();
                        connectedAccounts = accounts.oauth_credentials || [];
                        session.updateSettings({ connectedAccounts: $state.snapshot(connectedAccounts) });
                        snackbar('Account re-authenticated successfully!', undefined, true);
                    } catch (e) {
                        console.error('Failed to refresh accounts:', e);
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

    async function copyIcsToClipboard() {
        const icsUrlToCopy = $storedIcsUrl;
        if (!icsUrlToCopy) {
            console.error('No ICS URL available');
            return;
        }

        try {
            await navigator.clipboard.writeText(icsUrlToCopy);
            track('calendar_link_copied');
            snackbar('ICS URL copied to clipboard!', undefined, true);
        } catch (error) {
            console.error('Failed to copy ICS URL to clipboard:', error);
            snackbar('Failed to copy ICS URL to clipboard: ' + error, undefined, true);
        }
    }
</script>

<div class="@container flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto pb-2">
    {#if showEnvSwitcher}
    <section class="flex flex-row items-center justify-between gap-4 rounded-2xl bg-surface-container p-4 shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)] @max-[30rem]:flex-col @max-[30rem]:items-stretch">
        <div class="flex min-w-0 flex-col gap-1">
            <p class="m-0 text-xs font-bold uppercase tracking-wide text-primary">Developer</p>
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
        <div class="flex shrink-0 items-center gap-2">
            <SelectOutlined label=""
                options={[
                    { text: ENVIRONMENTS.prod.displayName, value: "prod" },
                    { text: ENVIRONMENTS.staging.displayName, value: "staging" },
                    { text: ENVIRONMENTS.dev.displayName, value: "dev" },
                ]}
                bind:value={environmentGetterSetter.value}
            />
        </div>
    </section>
    {/if}

    <section class="overflow-hidden rounded-2xl bg-surface-container-low shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.1)]">
        <div class="divide-y divide-outline-variant bg-surface-container">
    {#if !isOtherCalendar}
        <div class="flex flex-row items-center justify-between gap-4 p-4 @max-[30rem]:flex-col @max-[30rem]:items-stretch">
            <div class="flex min-w-0 flex-col gap-1">
                <h3 class="m-0 text-sm font-bold text-on-surface">Calendar link</h3>
                <p class="m-0 text-sm text-on-surface-variant">Copy your calendar feed URL to subscribe in other apps.</p>
            </div>
            <Button variant="outlined" square onclick={copyIcsToClipboard}>Copy Calendar Link</Button>
        </div>
    {/if}
    <div class="flex flex-row items-center justify-between gap-4 p-4 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
        <h3 class="m-0 text-sm font-bold text-on-surface">Default lecture color</h3>
        <div class="flex flex-row items-center gap-2">
            <ColorPicker
                value={defaultColorLecture}
                label="Default lecture color"
                onchange={(newColor) => { defaultColorLectureGetterSetter.value = newColor; }}
            />
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
        <h3 class="m-0 text-sm font-bold text-on-surface">Default lab color</h3>
        <div class="flex flex-row items-center gap-2">
            <ColorPicker
                value={defaultColorLab}
                label="Default lab color"
                onchange={(newColor) => { defaultColorLabGetterSetter.value = newColor; }}
            />
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4">
        <h3 class="m-0 text-sm font-bold text-on-surface">Time format</h3>
        <div class="flex flex-row items-center gap-2">
            <SelectOutlined label=""
                options={[
                    { text: "12-hour", value: "false" },
                    { text: "24-hour", value: "true" },
                ]}
                bind:value={militaryTimeGetterSetter.value}
            />
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 flex-col gap-1">
            <h3 class="m-0 text-sm font-bold text-on-surface">Advanced editing</h3>
            <p class="m-0 text-sm text-on-surface-variant">Use custom templates when editing calendar events.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
            <label>
                <Switch bind:checked={advancedEditingGetterSetter.value} />
            </label>
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 flex-col gap-1">
            <h3 class="m-0 text-sm font-bold text-on-surface">Show historic terms</h3>
            <p class="m-0 text-sm text-on-surface-variant">Show past terms alongside your current schedule.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
            <label>
                <Switch bind:checked={showHistoricTermsGetterSetter.value} />
            </label>
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 flex-col gap-1">
            <h3 class="m-0 text-sm font-bold text-on-surface">Disable all notifications</h3>
            <p class="m-0 text-sm text-on-surface-variant">Turn off all calendar event reminders.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
            <label>
                <Switch bind:checked={notificationsDisabledGetterSetter.value} />
            </label>
        </div>
    </div>
    <div class="flex flex-row items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 flex-col gap-1">
            <h3 class="m-0 text-sm font-bold text-on-surface">Share anonymous usage counts</h3>
            <p class="m-0 text-sm text-on-surface-variant">Counts such as how many schedule imports succeed. No names, emails, or schedules.</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
            <label>
                <Switch bind:checked={usageStatsGetterSetter.value} />
            </label>
        </div>
    </div>
        </div>
    </section>

    <section class="overflow-hidden rounded-2xl bg-surface-container shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]">
    <!-- Connected Google Accounts Section -->
    <div class="flex flex-col gap-3 p-4">
        <div class="flex flex-col gap-1">
            <h2 class="m-0 text-base font-bold text-on-surface">Connected Google accounts</h2>
            <p class="m-0 text-sm text-on-surface-variant">Add multiple Google accounts to sync your calendar.</p>
        </div>

        {#if connectedAccounts.length > 0}
            <div class="flex flex-col gap-2">
                {#each connectedAccounts as account (account.id)}
                    <div class={["flex flex-row items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 @max-[30rem]:flex-col @max-[30rem]:items-stretch", account.needs_reauth && "outline outline-1 outline-error"]}>
                        <div class="flex min-w-0 flex-col gap-1">
                            <div class="flex flex-row gap-2 items-center">
                                <svg class="w-5 h-5 {account.needs_reauth ? 'text-error' : 'text-primary'}" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                                </svg>
                                <span class="truncate text-sm text-on-surface">{account.email}</span>
                            </div>
                            {#if account.needs_reauth}
                                <span class="ml-7 text-xs text-error">
                                    {account.token_revoked ? 'Access revoked — please re-authenticate.' : 'Authentication expired — please re-authenticate.'}
                                </span>
                            {/if}
                        </div>
                        <div class="flex shrink-0 flex-row items-center gap-2">
                            {#if account.needs_reauth}
                                <Button variant="tonal" onclick={() => reauthAccount(account.email)}>
                                    Re-auth
                                </Button>
                            {/if}
                            {#if connectedAccounts.length > 1}
                                <Button variant="text" onclick={() => disconnectAccount(account.id)}>
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                    </svg>
                                </Button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {:else}
            <p class="m-0 rounded-xl bg-surface-container-lowest p-3 text-sm text-on-surface-variant">No Google accounts connected.</p>
        {/if}

        <div class="flex flex-row items-center gap-2 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
            <input
                type="email"
                placeholder="Enter email address"
                bind:value={addEmailInput}
                aria-label="Google account email"
                class="min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                onkeydown={(e) => e.key === 'Enter' && addGoogleAccount()}
            />
            <Button variant="tonal" onclick={addGoogleAccount}>Add Account</Button>
        </div>
    </div>

    <!-- Passkeys Section -->
    {#if canUsePasskeys}
        <div class="flex flex-col gap-3 border-t border-outline-variant p-4">
            <div class="flex flex-col gap-1">
                <h2 class="m-0 text-base font-bold text-on-surface">Passkeys</h2>
                <p class="m-0 text-sm text-on-surface-variant">Sign in on a new device without going through Google again.</p>
            </div>

            {#if passkeys.length > 0}
                <div class="flex flex-col gap-2">
                    {#each passkeys as passkey (passkey.id)}
                        <div class="flex flex-row items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3">
                            <div class="flex min-w-0 flex-col gap-1">
                                <div class="flex flex-row gap-2 items-center">
                                    <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 1a5 5 0 0 0-5 5c0 2.2 1.4 4.1 3.4 4.7L10 12v2H8v2h2v2l2 2 2-2V10.7A5 5 0 0 0 12 1zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                                    </svg>
                                    <span class="truncate text-sm text-on-surface">{passkey.nickname}</span>
                                </div>
                                <span class="ml-7 text-xs text-on-surface-variant">
                                    {passkey.last_used_at ? `Last used ${new Date(passkey.last_used_at).toLocaleDateString()}` : 'Never used'}
                                </span>
                            </div>
                            <Button variant="text" onclick={() => deletePasskey(passkey.id)}>
                                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </Button>
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="m-0 rounded-xl bg-surface-container-lowest p-3 text-sm text-on-surface-variant">No passkeys yet.</p>
            {/if}

            <div class="flex flex-row items-center gap-2 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
                <input
                    type="text"
                    placeholder="Name this device (optional)"
                    bind:value={newPasskeyName}
                    aria-label="Passkey device name"
                    class="min-w-0 flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
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
    <section class="flex flex-col gap-3 rounded-2xl bg-surface-container p-4 shadow-[0_1px_3px_rgb(var(--m3-scheme-shadow)/0.08)]">
        <div class="flex flex-row items-center justify-between gap-4">
            <div class="flex min-w-0 flex-col gap-1">
                <h2 class="m-0 text-base font-bold text-on-surface">Sync university events</h2>
                <p class="m-0 text-sm text-on-surface-variant">Add campus events to your calendar. Holidays are always synced.</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
                {#if syncUniversityEventsValue && availableCategories.length > 0}
                    <button
                        type="button"
                        class="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
                        aria-expanded={!uniEventsCollapsed}
                        aria-controls="uni-events-details"
                        aria-label={uniEventsCollapsed ? "Expand university event options" : "Collapse university event options"}
                        onclick={toggleUniEventsCollapsed}
                    >
                        <svg class={["h-5 w-5 transition-transform", !uniEventsCollapsed && "rotate-180"]} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                        </svg>
                    </button>
                {/if}
                <label>
                    <Switch bind:checked={syncUniversityEventsGetterSetter.value} />
                </label>
            </div>
        </div>

        {#if syncUniversityEventsValue && availableCategories.length > 0}
            <div id="uni-events-details" class={["flex flex-col gap-3", uniEventsCollapsed && "hidden"]}>
                <div class="flex flex-row items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
                    <h3 class="m-0 text-sm font-bold text-on-surface">University events color</h3>
                    <div class="flex flex-row gap-2 items-center">
                        <ColorPicker
                            value={uniCalColor}
                            label="University events color"
                            onchange={(newColor) => handleUniCalColorChange(newColor)}
                        />
                    </div>
                </div>

                <div class="flex flex-col gap-1">
                    <p class="m-0 mb-1 text-sm font-medium text-on-surface-variant">Event types to sync</p>
                    {#each availableCategories.filter(c => c.id !== 'holiday') as category (category.id)}
                        <label class="flex cursor-pointer flex-row items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-container-high">
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

    <section class="flex flex-row items-center justify-between gap-4 rounded-2xl bg-surface-container p-4 @max-[30rem]:flex-col @max-[30rem]:items-stretch">
        <div class="flex min-w-0 flex-col gap-1">
            <h2 class="m-0 text-base font-bold text-on-surface">Dev Tools</h2>
            <p class="m-0 text-sm text-on-surface-variant">Reload remote feature availability or reset local data</p>
        </div>
        <div class="flex shrink-0 flex-row items-center gap-2 @max-[24rem]:flex-col @max-[24rem]:items-stretch">
            <Button variant="tonal" onclick={manualRefreshFeatureFlags} disabled={isRefreshingFlags}>
                {isRefreshingFlags ? 'Refreshing...' : 'Refresh Flags'}
            </Button>
            <Button variant="filled" onclick={clearLocalData}>Clear Local Data</Button>
        </div>
    </section>
    <p class="m-0 rounded-xl bg-error-container px-4 py-3 text-center text-sm text-on-error-container">
        <span class="font-semibold">Warning:</span>
        Clearing local data signs you out, but does not affect your calendar data.
    </p>
    <p class="m-0 break-all px-2 pb-1 text-center text-xs text-on-surface-variant">
        {email ? `Signed in as ${email}` : 'Loading your account…'}
    </p>
</div>