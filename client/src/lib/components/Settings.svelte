<script lang="ts">
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { API } from "$lib/api";
    import { EnvironmentManager, ENVIRONMENTS, type Environment } from "$lib/environment";
    import { featureFlags } from "$lib/featureFlags";
    import { processedData as storedProcessedData, userSettings as storedUserSettings } from "$lib/store";
    import type { UserSettings } from "$lib/types";
    import { Button, SelectOutlined, snackbar, Switch } from "m3-svelte";
    import { onMount } from "svelte";

    // Google Calendar color ID to hex mapping
    const COLOR_ID_TO_HEX: Record<string, string> = {
        "1": "#7986cb",  // Lavender
        "2": "#33b679",  // Sage
        "3": "#8e24aa",  // Grape
        "4": "#e67c73",  // Flamingo
        "5": "#f6bf26",  // Banana
        "6": "#f4511e",  // Tangerine
        "7": "#039be5",  // Peacock
        "8": "#616161",  // Graphite
        "9": "#3f51b5",  // Blueberry
        "10": "#0b8043", // Basil
        "11": "#d50000", // Tomato
    };

    const HEX_TO_COLOR_ID: Record<string, string> = Object.fromEntries(
        Object.entries(COLOR_ID_TO_HEX).map(([id, hex]) => [hex, id])
    );

    let userSettings = $state<UserSettings | undefined>(undefined);
    let email = $state<string | undefined>(undefined);
    let currentEnvironment = $state<Environment>('prod');
    let authenticatedEnvironments = $state<Environment[]>([]);
    let notificationsDisabled = $state(false);
    let connectedAccounts = $state<Array<{id: string, email: string, provider: string, needs_reauth: boolean, token_revoked: boolean}>>([]);
    let addEmailInput = $state("");
    let showEnvSwitcher = $state<boolean>(false);
    let isRefreshingFlags = $state<boolean>(false);
    const UNI_CAL_COLOR_STORAGE_KEY = "uniCalColor";
    let uniCalColor = $state<string>(
        browser ? (localStorage.getItem(UNI_CAL_COLOR_STORAGE_KEY) ?? "") : "#616161"
    );
    let hasLoadedUniCalColor = $state(false);

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

    onMount(async () => {
        await EnvironmentManager.migrateOldJwtToken();

        try {
            // Load feature flags and settings in parallel
            const [, userSettingsData, emailData] = await Promise.all([
                featureFlags.loadFlags(),
                API.userSettings(),
                API.getUserEmail()
            ]);

            userSettings = userSettingsData;
            storedUserSettings.set(userSettings);
            email = emailData.email;
            showEnvSwitcher = featureFlags.isEnabledSync('envSwitcher');

            // Fetch notification DND status
            try {
                const status = await API.getNotificationStatus();
                notificationsDisabled = status.notifications_disabled;
            } catch (e) {
                // DND status might not be available, that's okay
            }

            // Fetch connected accounts
            try {
                const accounts = await API.getConnectedAccounts();
                connectedAccounts = accounts.oauth_credentials || [];
            } catch (e) {
                console.error('Failed to fetch connected accounts:', e);
            }

            // Fetch uni cal color preference
            try {
                const calPrefs = await API.getCalendarPreferences();
                // Check if any uni_cal_category has a color set (they should all be the same)
                const firstCategory = Object.values(calPrefs.uni_cal_categories || {})[0];
                if (firstCategory?.color_id) {
                    const colorId = String(firstCategory.color_id);
                    const resolvedColor = COLOR_ID_TO_HEX[colorId];
                    if (resolvedColor) {
                        uniCalColor = resolvedColor;
                        if (browser) {
                            localStorage.setItem(UNI_CAL_COLOR_STORAGE_KEY, resolvedColor);
                        }
                    }
                }
            } catch (e) {
                // Calendar preferences might not exist yet, that's okay
            } finally {
                hasLoadedUniCalColor = true;
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }

        currentEnvironment = await EnvironmentManager.getCurrentEnvironment();
        authenticatedEnvironments = await EnvironmentManager.getAuthenticatedEnvironments();
    });

    let defaultColorLecture = $derived(userSettings?.default_color_lecture ?? "");
    let defaultColorLab = $derived(userSettings?.default_color_lab ?? "");
    let militaryTimeValue = $derived(userSettings?.military_time ? "true" : "false");
    let advancedEditingValue = $derived(userSettings?.advanced_editing ?? false);
    let syncUniversityEventsValue = $derived(userSettings?.sync_university_events ?? false);
    let universityEventCategories = $derived(userSettings?.university_event_categories ?? []);
    let availableCategories = $derived(userSettings?.available_university_event_categories ?? []);

    const defaultColorLectureGetterSetter = {
        get value() { return defaultColorLecture; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, default_color_lecture: value };
			storedUserSettings.set(userSettings);
			API.userSettings(userSettings);
			clearStoredColors();
		}
    }

    const militaryTimeGetterSetter = {
        get value() { return militaryTimeValue; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, military_time: value === "true" };
			storedUserSettings.set(userSettings);
			API.userSettings(userSettings);
		}
    }

    const defaultColorLabGetterSetter = {
        get value() { return defaultColorLab; },
		set value(value: string) {
			if (!userSettings) return;
			userSettings = { ...userSettings, default_color_lab: value };
			storedUserSettings.set(userSettings);
			API.userSettings(userSettings);
			clearStoredColors();
		}
    }

    const advancedEditingGetterSetter = {
        get value() { return advancedEditingValue; },
		set value(value: boolean) {
			if (!userSettings) return;
			userSettings = { ...userSettings, advanced_editing: value };
			storedUserSettings.set(userSettings);
			API.userSettings(userSettings);
		}
    }

    const syncUniversityEventsGetterSetter = {
        get value() { return syncUniversityEventsValue; },
		set value(value: boolean) {
			if (!userSettings) return;
			userSettings = { ...userSettings, sync_university_events: value };
			storedUserSettings.set(userSettings);
			API.userSettings(userSettings);
		}
    }

    async function handleUniCalColorChange(newColor: string) {
        if (!hasLoadedUniCalColor) return;
        if (!newColor) return;
        uniCalColor = newColor;
        const colorId = HEX_TO_COLOR_ID[newColor] || "8"; // Default to Graphite

        try {
            await API.setAllUniCalCategoriesColor(colorId);
            if (browser) {
                localStorage.setItem(UNI_CAL_COLOR_STORAGE_KEY, newColor);
            }
            snackbar('University events color updated', undefined, true);
        } catch (error) {
            console.error('Failed to update university events color:', error);
            snackbar('Failed to update color. Please try again.', undefined, true);
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
        API.userSettings(userSettings);
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
        const hasJwt = await EnvironmentManager.switchEnvironment(newEnv);

        if (browser) {
            sessionStorage.setItem('returnToSettings', 'true');
            sessionStorage.setItem('clearCalendarData', 'true');
        }

        const envDisplayName = ENVIRONMENTS[newEnv].displayName;

        if (!hasJwt) {
            storedProcessedData.set([]);
            snackbar(`Switched to ${envDisplayName}. Please sign in.`, undefined, true);
            await goto('/');
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
                // Open OAuth popup
                const popup = window.open(response.oauth_url, 'Google OAuth', 'width=500,height=600');

                // Poll for popup close
                const pollTimer = setInterval(async () => {
                    if (popup?.closed) {
                        clearInterval(pollTimer);
                        // Refresh connected accounts
                        try {
                            const accounts = await API.getConnectedAccounts();
                            connectedAccounts = accounts.oauth_credentials || [];
                            snackbar('Account connected successfully!', undefined, true);
                        } catch (e) {
                            console.error('Failed to refresh accounts:', e);
                        }
                        addEmailInput = "";
                    }
                }, 500);
            } else if (response.calendar_id) {
                // Already connected
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
                const popup = window.open(response.oauth_url, 'Google OAuth', 'width=500,height=600');

                const pollTimer = setInterval(async () => {
                    if (popup?.closed) {
                        clearInterval(pollTimer);
                        try {
                            const accounts = await API.getConnectedAccounts();
                            connectedAccounts = accounts.oauth_credentials || [];
                            snackbar('Account re-authenticated successfully!', undefined, true);
                        } catch (e) {
                            console.error('Failed to refresh accounts:', e);
                        }
                    }
                }, 500);
            }
        } catch (e) {
            console.error('Failed to re-authenticate account:', e);
            snackbar('Failed to re-authenticate account', undefined, true);
        }
    }

    async function clearLocalStorage() {
        await chrome.storage.local.clear();
        localStorage.clear();
        sessionStorage.clear();
        storedUserSettings.set(undefined);
        storedProcessedData.set([]);
        snackbar('Local data cleared successfully', undefined, true);
        await goto('/');
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

<div class="flex flex-row items-center justify-between mb-4">
    <h1 class="text-lg font-bold">Currently signed in as: {email}</h1>
</div>

<div class="flex flex-col gap-3">
    {#if showEnvSwitcher}
    <div class="flex flex-row gap-3 items-center justify-between">
        <div class="flex flex-col">
            <h2 class="text-md font-bold">Environment</h2>
            <p class="text-sm text-outline">
                {#each Object.values(ENVIRONMENTS) as env}
                    {#if authenticatedEnvironments.includes(env.name)}
                        <span class="text-primary">✓ {env.displayName}</span>
                    {:else}
                        <span class="text-outline-variant">○ {env.displayName}</span>
                    {/if}
                    {#if env.name !== 'prod'}&nbsp;&nbsp;{/if}
                {/each}
            </p>
        </div>
        <div class="flex flex-row gap-2 items-center">
            <SelectOutlined label=""
                options={[
                    { text: ENVIRONMENTS.prod.displayName, value: "prod" },
                    { text: ENVIRONMENTS.staging.displayName, value: "staging" },
                    { text: ENVIRONMENTS.dev.displayName, value: "dev" },
                ]}
                bind:value={environmentGetterSetter.value}
            />
        </div>
    </div>
    {/if}
    <div class="flex flex-row gap-3 items-center justify-between">
        <h2 class="text-md font-bold">Default Lecture Color</h2>
        <div class="flex flex-row gap-2 items-center">
            <div class="w-6 h-6 rounded-full border-2 border-outline other-stuff" style="background-color: {userSettings?.default_color_lecture};"></div>
            <SelectOutlined label=""
                options={[
                    { text: "Tomato", value: "#d50000" },
                    { text: "Flamingo", value: "#e67c73" },
                    { text: "Tangerine", value: "#f4511e" },
                    { text: "Banana", value: "#f6bf26" },
                    { text: "Sage", value: "#33b679" },
                    { text: "Basil", value: "#0b8043" },
                    { text: "Peacock", value: "#039be5" },
                    { text: "Blueberry", value: "#3f51b5" },
                    { text: "Lavender", value: "#7986cb" },
                    { text: "Grape", value: "#8e24aa" },
                    { text: "Graphite", value: "#616161" },
                ]}
                bind:value={defaultColorLectureGetterSetter.value}
            />
        </div>
    </div>
    <div class="flex flex-row gap-3 items-center justify-between">
        <h2 class="text-md font-bold">Default Lab Color</h2>
        <div class="flex flex-row gap-2 items-center">
            <div class="w-6 h-6 rounded-full border-2 border-outline other-stuff" style="background-color: {userSettings?.default_color_lab};"></div>
            <SelectOutlined label=""
                options={[
                    { text: "Tomato", value: "#d50000" },
                    { text: "Flamingo", value: "#e67c73" },
                    { text: "Tangerine", value: "#f4511e" },
                    { text: "Banana", value: "#f6bf26" },
                    { text: "Sage", value: "#33b679" },
                    { text: "Basil", value: "#0b8043" },
                    { text: "Peacock", value: "#039be5" },
                    { text: "Blueberry", value: "#3f51b5" },
                    { text: "Lavender", value: "#7986cb" },
                    { text: "Grape", value: "#8e24aa" },
                    { text: "Graphite", value: "#616161" },
                ]}
                bind:value={defaultColorLabGetterSetter.value}
            />
        </div>
    </div>
    <div class="flex flex-row gap-3 items-center justify-between">
        <h2 class="text-md font-bold">Time Format</h2>
        <div class="flex flex-row gap-2 items-center">
            <SelectOutlined label=""
                options={[
                    { text: "12-hour", value: "false" },
                    { text: "24-hour", value: "true" },
                ]}
                bind:value={militaryTimeGetterSetter.value}
            />
        </div>
    </div>
    <div class="flex flex-row gap-3 items-center justify-between">
        <h2 class="text-md font-bold">Advanced Editing</h2>
        <div class="flex flex-row gap-2 items-center">
            <label>
                <Switch bind:checked={advancedEditingGetterSetter.value} />
            </label>
        </div>
    </div>
    <div class="flex flex-row gap-3 items-center justify-between">
        <div class="flex flex-col">
            <h2 class="text-md font-bold">Disable All Notifications</h2>
            <p class="text-sm text-outline">Turn off all calendar event reminders</p>
        </div>
        <div class="flex flex-row gap-2 items-center">
            <label>
                <Switch bind:checked={notificationsDisabledGetterSetter.value} />
            </label>
        </div>
    </div>

    <!-- Connected Google Accounts Section -->
    <div class="flex flex-col gap-3 mt-4 pt-4 border-t border-outline-variant">
        <div class="flex flex-col gap-1">
            <h2 class="text-md font-bold">Connected Google Accounts</h2>
            <p class="text-sm text-outline">Add multiple Google accounts to sync your calendar</p>
        </div>

        {#if connectedAccounts.length > 0}
            <div class="flex flex-col gap-2">
                {#each connectedAccounts as account}
                    <div class="flex flex-row gap-3 items-center justify-between bg-surface-container-low rounded-lg p-3 {account.needs_reauth ? 'border border-error' : ''}">
                        <div class="flex flex-col gap-1">
                            <div class="flex flex-row gap-2 items-center">
                                <svg class="w-5 h-5 {account.needs_reauth ? 'text-error' : 'text-primary'}" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                                </svg>
                                <span class="text-sm">{account.email}</span>
                            </div>
                            {#if account.needs_reauth}
                                <span class="text-xs text-error ml-7">
                                    {account.token_revoked ? 'Access revoked - please re-authenticate' : 'Authentication expired - please re-authenticate'}
                                </span>
                            {/if}
                        </div>
                        <div class="flex flex-row gap-2 items-center">
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
            <p class="text-sm text-outline-variant italic">No Google accounts connected</p>
        {/if}

        <div class="flex flex-row gap-2 items-center">
            <input
                type="email"
                placeholder="Enter email address"
                bind:value={addEmailInput}
                class="flex-1 px-3 py-2 text-sm border border-outline-variant rounded-lg bg-surface focus:border-primary focus:outline-none"
                onkeydown={(e) => e.key === 'Enter' && addGoogleAccount()}
            />
            <Button variant="tonal" onclick={addGoogleAccount}>Add Account</Button>
        </div>
    </div>

    <!-- University Calendar Events Section -->
    <div class="flex flex-col gap-3 mt-4 pt-4 border-t border-outline-variant">
        <div class="flex flex-row gap-3 items-center justify-between">
            <div class="flex flex-col">
                <h2 class="text-md font-bold">Sync University Events</h2>
                <p class="text-sm text-outline">Add campus events to your calendar (holidays are always synced)</p>
            </div>
            <div class="flex flex-row gap-2 items-center">
                <label>
                    <Switch bind:checked={syncUniversityEventsGetterSetter.value} />
                </label>
            </div>
        </div>

        {#if syncUniversityEventsValue && availableCategories.length > 0}
            <div class="flex flex-row gap-3 items-center justify-between">
                <h2 class="text-md font-bold">University Events Color</h2>
                <div class="flex flex-row gap-2 items-center">
                    <div class="w-6 h-6 rounded-full border-2 border-outline" style="background-color: {uniCalColor};"></div>
                    <SelectOutlined label=""
                        options={[
                            { text: "Tomato", value: "#d50000" },
                            { text: "Flamingo", value: "#e67c73" },
                            { text: "Tangerine", value: "#f4511e" },
                            { text: "Banana", value: "#f6bf26" },
                            { text: "Sage", value: "#33b679" },
                            { text: "Basil", value: "#0b8043" },
                            { text: "Peacock", value: "#039be5" },
                            { text: "Blueberry", value: "#3f51b5" },
                            { text: "Lavender", value: "#7986cb" },
                            { text: "Grape", value: "#8e24aa" },
                            { text: "Graphite", value: "#616161" },
                        ]}
                        bind:value={uniCalColor}
                        onchange={() => handleUniCalColorChange(uniCalColor)}
                    />
                </div>
            </div>

            <div class="flex flex-col gap-2 ml-2 pl-4 border-l-2 border-outline-variant">
                <p class="text-sm text-outline font-medium">Select event types to sync:</p>
                {#each availableCategories.filter(c => c.id !== 'holiday') as category}
                    <label class="flex flex-row gap-3 items-start cursor-pointer hover:bg-surface-variant rounded-lg p-2 -m-2 transition-colors">
                        <input
                            type="checkbox"
                            checked={isCategorySelected(category.id)}
                            onchange={() => toggleUniversityCategory(category.id)}
                            class="mt-1 w-4 h-4 accent-primary"
                        />
                        <div class="flex flex-col">
                            <span class="text-sm font-medium">{category.name}</span>
                            <span class="text-xs text-outline">{category.description}</span>
                        </div>
                    </label>
                {/each}
            </div>
        {/if}
    </div>

    <div class="flex flex-col gap-2 items-center justify-center mt-6 w-full">
        <Button variant="tonal" onclick={manualRefreshFeatureFlags} disabled={isRefreshingFlags}>
            {isRefreshingFlags ? 'Refreshing...' : 'Refresh Flags'}
        </Button>
    </div>
    <div class="flex flex-col gap-2 items-center justify-center mt-6 w-full">
        <Button variant="filled" onclick={clearLocalStorage}>Clear Local Data</Button>
        <p class="text-sm text-error text-center max-w-md">
            <span class="font-semibold">Warning:</span>
            This will clear all your local data and you will need to sign in again. This does <b>not</b> affect your Calendar data.
        </p>
    </div>
</div>